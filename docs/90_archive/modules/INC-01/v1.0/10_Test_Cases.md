# INC-01 Incident / Freeze / Recovery
## 10 Test Cases

## 1. Incident Intake / Classification Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| INC1-TC-001 | Manual incident created | Incident ID created | Critical |
| INC1-TC-002 | SEC alert creates incident | Incident linked to alert | Critical |
| INC1-TC-003 | REC critical break creates incident | Incident linked to break | Critical |
| INC1-TC-004 | Safeguarding deficit classified | Critical severity | Critical |
| INC1-TC-005 | Provider outage classified | Severity by impact | High |

## 2. Freeze / Propagation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| INC1-TC-006 | Platform freeze requested | CFG/IAM/LED/DEP/WDR/TRD freeze sent | Critical |
| INC1-TC-007 | Client-specific freeze | Client scoped freeze sent | Critical |
| INC1-TC-008 | Missing module acknowledgement | Escalation | Critical |
| INC1-TC-009 | Freeze release without resume gate | Blocked | Critical |
| INC1-TC-010 | Kill-switch bypass attempt | Blocked/alert | Critical |

## 3. Money-Flow Quiescence Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| INC1-TC-011 | Deposit pending credit during freeze | DEP/LED hold/quarantine | Critical |
| INC1-TC-012 | Payout built but not sent | WDR stop/cancel if possible | Critical |
| INC1-TC-013 | Payout sent but not final | Query/cancel/monitor disposition | Critical |
| INC1-TC-014 | Payout final before freeze | Irreversible exception path | Critical |
| INC1-TC-015 | Trade hold placed but LP not executed | Stop/release via owning modules | Critical |
| INC1-TC-016 | LP fill final during incident | TRD/LED settlement exception | Critical |
| INC1-TC-017 | In-flight item lacks disposition | Resume/closure blocked | Critical |

## 4. Evidence / Notification Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| INC1-TC-018 | Evidence captured | Hash-linked evidence | Critical |
| INC1-TC-019 | Evidence export without approval | Blocked | Critical |
| INC1-TC-020 | Notification obligation created | Deadline tracked | High |
| INC1-TC-021 | Notification deadline missed | Escalation | Critical |
| INC1-TC-022 | Notification marked not required without reason | Blocked | High |

## 5. Recovery / Resume / Closure Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| INC1-TC-023 | Recovery plan for critical incident missing | Closure blocked | Critical |
| INC1-TC-024 | Resume with REC validation missing | Blocked | Critical |
| INC1-TC-025 | Resume with SEC evidence missing | Blocked | Critical |
| INC1-TC-026 | Resume with source module unsafe state | Blocked | Critical |
| INC1-TC-027 | Valid resume gate | Freeze release allowed | Critical |
| INC1-TC-028 | Closure without evidence pack | Blocked | Critical |
| INC1-TC-029 | Closure without PIR for critical incident | Blocked | Critical |
| INC1-TC-030 | Closure with overdue action not accepted | Blocked/escalated | High |

## 6. Boundary / Status Truth Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| INC1-TC-031 | INC attempts ledger post | Blocked/alert | Critical |
| INC1-TC-032 | INC edits client balance | Blocked/alert | Critical |
| INC1-TC-033 | INC clears REC break | Blocked | Critical |
| INC1-TC-034 | Executed-late payout shown cancelled | Blocked/corrected | Critical |
| INC1-TC-035 | Unresolved incident shown complete to client | Blocked/corrected | Critical |
| INC1-TC-036 | Exchange feature enabled during recovery | Blocked | Critical |

## 7. Go-Live Criteria

```txt
incident_intake_tests_passed = true
freeze_propagation_tests_passed = true
money_flow_quiescence_tests_passed = true
evidence_notification_tests_passed = true
recovery_resume_closure_tests_passed = true
boundary_status_truth_tests_passed = true
critical_control_coverage = 100_percent
```
