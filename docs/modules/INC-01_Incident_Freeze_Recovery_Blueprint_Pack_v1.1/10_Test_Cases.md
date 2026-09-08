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


## 7. v1.1 Atomic / Verified Freeze Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| INC1-TC-037 | Freeze propagation in progress and payout attempts send | Denied by default | Critical |
| INC1-TC-038 | WDR ack received but effectiveness proof missing | Not contained | Critical |
| INC1-TC-039 | Partial freeze with TRD not frozen | Fail-closed/escalate/broaden | Critical |
| INC1-TC-040 | Freeze intake before exit points | Design failure | Critical |
| INC1-TC-041 | Module misses freeze ack SLA | High/critical escalation | Critical |
| INC1-TC-042 | Effective freeze verified across scoped modules | Contained status allowed | Critical |

## 8. v1.1 Authority / Abuse / Integrity Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| INC1-TC-043 | Same actor declares resolved and releases freeze | Blocked | Critical |
| INC1-TC-044 | Platform freeze without maker-checker outside auto-freeze | Blocked | Critical |
| INC1-TC-045 | Severity downgrade without approval | Blocked/alert | Critical |
| INC1-TC-046 | Qualifying alert not raised as incident | Anti-suppression alert | Critical |
| INC1-TC-047 | INC record hash-chain missing for critical incident | Block finalisation | Critical |
| INC1-TC-048 | INC record tampered | Critical alert | Critical |

## 9. v1.1 Degraded-Mode Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| INC1-TC-049 | CFG compromised and normal kill-switch untrusted | Out-of-band freeze path | Critical |
| INC1-TC-050 | IAM unavailable | Bounded break-glass freeze only | Critical |
| INC1-TC-051 | SEC audit suspected compromised | Independent evidence capture | Critical |
| INC1-TC-052 | Break-glass attempts resume | Blocked | Critical |
| INC1-TC-053 | Degraded actions not reconciled after recovery | Closure blocked | Critical |

## 10. v1.1 Closed-Loop Money Recovery Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| INC1-TC-054 | In-flight payout lacks terminal corrected disposition | Resume blocked | Critical |
| INC1-TC-055 | Orphan LED reserve unresolved | Resume blocked | Critical |
| INC1-TC-056 | Executed-late payout not settled/exceptioned in LED | Resume blocked | Critical |
| INC1-TC-057 | Incident value position not restored | Resume blocked | Critical |
| INC1-TC-058 | Safeguarding not proven intact | Resume blocked | Critical |
| INC1-TC-059 | REC ran but validation failed | Resume blocked | Critical |
| INC1-TC-060 | All incident-scoped items terminal corrected and value restored | Resume allowed subject to approvals | Critical |

## 11. v1.1 Freeze Collateral / Client Access Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| INC1-TC-061 | Platform-wide freeze used where client-specific freeze sufficient | Scope justification required | High |
| INC1-TC-062 | Freeze exceeds duration SLA without re-justification | Escalation/block extension | Critical |
| INC1-TC-063 | Withdrawal freeze denies client access to safeguarded money | Consequence tracked | Critical |
| INC1-TC-064 | Client access denial notification required but missing | Escalation | Critical |
| INC1-TC-065 | Already-owed payout obligation during freeze | Owed obligation classified | Critical |

## 12. v1.1 Overlap / Auto-Freeze / E2E Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| INC1-TC-066 | Two incidents freeze same client | Reference-counted holds | Critical |
| INC1-TC-067 | Release one incident while another freeze active | Scope remains frozen | Critical |
| INC1-TC-068 | Safeguarding deficit detected | Auto-freeze starts | Critical |
| INC1-TC-069 | Sanctions hit after movement | Auto-freeze starts | Critical |
| INC1-TC-070 | In-flight disposition not linked to E2E saga | Block recovery | Critical |
| INC1-TC-071 | E2E compensation contradicts INC disposition | Break/escalation | Critical |

## 13. v1.1 Notification / Communication Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| INC1-TC-072 | Notification clock starts at escalation not detection | Correct to detection unless policy allows | Critical |
| INC1-TC-073 | REC and INC create duplicate/conflicting obligation | Reconciled | High |
| INC1-TC-074 | Client communication risks AML tipping-off | Blocked/Compliance approval | Critical |
| INC1-TC-075 | Security incident external comms without Security/Compliance approval | Blocked | High |
| INC1-TC-076 | Staff script contradicts client-status truth | Blocked/corrected | High |

## 14. v1.1 Additional Evidence / Closure Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| INC1-TC-077 | Evidence pack lacks freeze effectiveness proof | Closure blocked | Critical |
| INC1-TC-078 | Evidence pack lacks client-access consequence review | Closure blocked if applicable | High |
| INC1-TC-079 | Evidence pack lacks degraded-mode reconciliation | Closure blocked | Critical |
| INC1-TC-080 | Resume gate lacks independent approval | Blocked | Critical |
| INC1-TC-081 | Freeze release despite active reference-counted hold | Blocked | Critical |
| INC1-TC-082 | Critical incident closed with open remediation action not accepted | Blocked/escalated | High |
| INC1-TC-083 | Incident report finalised without hash anchor | Blocked | Critical |

---

## 15. Go-Live Criteria

```txt
incident_intake_tests_passed = true
freeze_propagation_tests_passed = true
money_flow_quiescence_tests_passed = true
evidence_notification_tests_passed = true
recovery_resume_closure_tests_passed = true
boundary_status_truth_tests_passed = true
atomic_verified_freeze_tests_passed = true
authority_abuse_integrity_tests_passed = true
degraded_mode_tests_passed = true
closed_loop_money_recovery_tests_passed = true
freeze_collateral_tests_passed = true
overlap_autofreeze_e2e_tests_passed = true
notification_communication_tests_passed = true
additional_evidence_closure_tests_passed = true
critical_control_coverage = 100_percent
```
