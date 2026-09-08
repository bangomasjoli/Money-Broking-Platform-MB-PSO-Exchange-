# WLT-01 Wallet Screening / Payout Destination Whitelist
## 10 Test Cases

## 1. Wallet Registration / Screening Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WLT1-TC-001 | Register valid wallet | Destination draft/pending | Critical |
| WLT1-TC-002 | Invalid address | Rejected | High |
| WLT1-TC-003 | Chain/address mismatch | Denied | Critical |
| WLT1-TC-004 | Private key requested/stored | Blocked | Critical |
| WLT1-TC-005 | Wallet screening clear | Review may proceed | Critical |
| WLT1-TC-006 | Wallet high-risk | Compliance review/reject | Critical |
| WLT1-TC-007 | Wallet sanctions exposure | Block/escalate | Critical |
| WLT1-TC-008 | Vendor result unauthenticated | Reject/alert | Critical |

---

## 2. Payout Destination Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WLT1-TC-009 | Register payout destination | Pending review | Critical |
| WLT1-TC-010 | Beneficiary matches client | Verification pass | High |
| WLT1-TC-011 | Beneficiary mismatch | Review/block | Critical |
| WLT1-TC-012 | Third-party beneficiary without approval | Blocked | Critical |
| WLT1-TC-013 | Bank verification invalid | Blocked | Critical |
| WLT1-TC-014 | High-risk jurisdiction payout | Compliance review | High |

---

## 3. Approval / Cooling-Off Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WLT1-TC-015 | Whitelist without IAM-02 approval | Blocked | Critical |
| WLT1-TC-016 | Client maker approves own destination | Blocked | Critical |
| WLT1-TC-017 | Destination approved starts cooling-off | Cooling active | High |
| WLT1-TC-018 | Use before cooling-off ends | Denied | Critical |
| WLT1-TC-019 | Cooling-off override without approval | Blocked | Critical |
| WLT1-TC-020 | Cooling-off completes, no new risk | Destination active | High |

---

## 4. Destination Use Gate Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WLT1-TC-021 | Active destination with AML clear | Decision allow | Critical |
| WLT1-TC-022 | Destination not whitelisted | Denied | Critical |
| WLT1-TC-023 | Destination revoked | Denied | Critical |
| WLT1-TC-024 | AML decision stale | Denied/refresh | Critical |
| WLT1-TC-025 | Travel Rule data missing | Hold/review | Critical |
| WLT1-TC-026 | Scope mismatch token reuse | Denied | Critical |
| WLT1-TC-027 | Whitelist clear executes payout directly | Blocked/downstream only | Critical |

---

## 5. Revocation / Rescreening Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WLT1-TC-028 | AML true hit received | Destination revoked/restricted | Critical |
| WLT1-TC-029 | Client suspended | Destination revoked/restricted | Critical |
| WLT1-TC-030 | Mandate revoked | Destination revoked/restricted | Critical |
| WLT1-TC-031 | Vendor update new risk | Rescreen/revoke | Critical |
| WLT1-TC-032 | Revoked destination used downstream | Critical finding | Critical |
| WLT1-TC-033 | Rescreen clear | Validity updated | High |

---

## 6. Sensitive Access / Reconciliation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WLT1-TC-034 | Sensitive destination read | SEC-01 audit | High |
| WLT1-TC-035 | Sensitive read log fails | Read denied | Critical |
| WLT1-TC-036 | Active destination with stale AML | Reconciliation finding | Critical |
| WLT1-TC-037 | Active destination before cooling-off complete | Critical finding | Critical |
| WLT1-TC-038 | Direct DB whitelist edit suspected | Critical finding | Critical |
| WLT1-TC-039 | High-risk wallet active without Compliance approval | Critical finding | Critical |
| WLT1-TC-040 | Beneficiary mismatch active without approval | Critical finding | Critical |

---

## 7. Go-Live Criteria

```txt
wallet_registration_screening_tests_passed = true
payout_destination_tests_passed = true
approval_cooling_tests_passed = true
destination_use_gate_tests_passed = true
revocation_rescreening_tests_passed = true
sensitive_access_reconciliation_tests_passed = true
critical_control_coverage = 100_percent
```
