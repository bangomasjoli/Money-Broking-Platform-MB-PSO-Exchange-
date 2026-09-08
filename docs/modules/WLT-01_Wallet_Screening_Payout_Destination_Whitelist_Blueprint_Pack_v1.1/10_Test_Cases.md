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


## 7. Execution-Time / Limit Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WLT1-TC-041 | Downstream executes with token but no revalidation | Blocked | Critical |
| WLT1-TC-042 | Destination revoked after token issued | Execution revalidation denies | Critical |
| WLT1-TC-043 | AML revocation epoch changed after token issued | Execution denied | Critical |
| WLT1-TC-044 | Decision token reused for different execution ref | Denied | Critical |
| WLT1-TC-045 | Amount exceeds per-destination limit | Hold/deny | Critical |
| WLT1-TC-046 | Daily velocity exceeded | Hold/deny | Critical |
| WLT1-TC-047 | New destination first-use above threshold | Step-up/hold | Critical |

---

## 8. Inbound Source / Quarantine Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WLT1-TC-048 | Inbound crypto deposit from unscreened source | Quarantined | Critical |
| WLT1-TC-049 | Inbound source sanctions/high-risk hit | Quarantined + Compliance escalation | Critical |
| WLT1-TC-050 | Inbound source cannot match client/destination | Quarantined, not auto-credited | Critical |
| WLT1-TC-051 | Clear matched inbound source | Eligible for attribution | High |

---

## 9. Unhosted Wallet / Address Integrity Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WLT1-TC-052 | Unhosted wallet without proof-of-control | Activation blocked | Critical |
| WLT1-TC-053 | Signed-message proof verified | Proof accepted | High |
| WLT1-TC-054 | Third-party wallet no approved beneficiary | Blocked | Critical |
| WLT1-TC-055 | Name-service alias submitted | Resolve raw; alias not authoritative | Critical |
| WLT1-TC-056 | Bad checksum/canonicalisation | Rejected | Critical |
| WLT1-TC-057 | Address poisoning/lookalike detected | Review/hold | Critical |
| WLT1-TC-058 | Unsupported chain/asset | Hold/review, not clear | Critical |

---

## 10. AML Revocation / Cooling-Off / Coverage Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WLT1-TC-059 | AML-01 revocation signal received | Destination restricted/revoked | Critical |
| WLT1-TC-060 | AML new hit during cooling-off | Cooling-off cancelled | Critical |
| WLT1-TC-061 | Vendor coverage downgraded | Destination review/restricted | High |
| WLT1-TC-062 | KYC beneficiary relationship missing | Review/block | High |
| WLT1-TC-063 | Cooling-off completes despite new risk | Blocked | Critical |

---

## 11. Additional Reconciliation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| WLT1-TC-064 | Money movement occurred without verify-and-consume | Critical finding | Critical |
| WLT1-TC-065 | Limit breach but destination allowed | Critical finding | Critical |
| WLT1-TC-066 | Quarantined deposit credited | Critical finding | Critical |
| WLT1-TC-067 | Active unhosted wallet without proof | Critical finding | Critical |
| WLT1-TC-068 | Unsupported chain active as clear | Critical finding | Critical |
| WLT1-TC-069 | AML revocation not propagated | Critical finding | Critical |

---

## 12. Go-Live Criteria

```txt
wallet_registration_screening_tests_passed = true
payout_destination_tests_passed = true
approval_cooling_tests_passed = true
destination_use_gate_tests_passed = true
revocation_rescreening_tests_passed = true
sensitive_access_reconciliation_tests_passed = true
execution_limit_tests_passed = true
inbound_quarantine_tests_passed = true
unhosted_address_integrity_tests_passed = true
aml_revocation_cooling_coverage_tests_passed = true
additional_reconciliation_tests_passed = true
critical_control_coverage = 100_percent
```
