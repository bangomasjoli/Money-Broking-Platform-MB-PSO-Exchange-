# E2E-01 Cross-Module End-to-End Fund-Flow Review
## 07 E2E Test Scenarios

## 1. Onboarding / Eligibility Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| E2E-TC-001 | Client approved by CLT but KYC pending | Trading/payment blocked | Critical |
| E2E-TC-002 | KYC pass but AML stale | Trading/payment blocked | Critical |
| E2E-TC-003 | AML clear but CLT suspended | Trading/payment blocked | Critical |
| E2E-TC-004 | Mandate invalid | Client action blocked | Critical |
| E2E-TC-005 | Retail client where feature disabled | Blocked by CFG/CLT | Critical |

## 2. Deposit Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| E2E-TC-006 | Deposit from clear matched source | Available after LED backing check | Critical |
| E2E-TC-007 | Deposit from unscreened source | Quarantined, no credit | Critical |
| E2E-TC-008 | Deposit from sanctioned source | Quarantine + AML escalation | Critical |
| E2E-TC-009 | Deposit source mismatch | Quarantine, no auto-credit | Critical |
| E2E-TC-010 | Backing not free/confirmed | No available credit | Critical |

## 3. Wallet / Payout Destination Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| E2E-TC-011 | New wallet before cooling-off ends | Destination use denied | Critical |
| E2E-TC-012 | Unhosted wallet no proof-of-control | Whitelist blocked | Critical |
| E2E-TC-013 | AML revokes destination | WLT invalidates, LED blocks | Critical |
| E2E-TC-014 | Destination decision reused with different amount | LED/WLT deny | Critical |
| E2E-TC-015 | Travel Rule data missing | Hold/review | Critical |

## 4. Trade / LP Execution Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| E2E-TC-016 | Valid quote → hold → LP fill → LED settlement | Pass | Critical |
| E2E-TC-017 | Quote accepted after LP quote expiry | Rejected | Critical |
| E2E-TC-018 | LP execution without LED hold | Blocked | Critical |
| E2E-TC-019 | Client fill without external LP fill | Blocked | Critical |
| E2E-TC-020 | Hidden spread in price identity | Blocked | Critical |
| E2E-TC-021 | LP timeout then late fill after void | Exception, no settlement | Critical |
| E2E-TC-022 | Internal crossing/netting attempt | Blocked | Critical |
| E2E-TC-023 | CFG licence lock revoked before LP execution | Blocked | Critical |
| E2E-TC-024 | LED settlement fails after client fill | Confirmation corrected/pending/failed | Critical |

## 5. Ledger / Safeguarding Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| E2E-TC-025 | Concurrent holds against same balance | Atomic reservation prevents overspend | Critical |
| E2E-TC-026 | Journal unbalanced | Rejected | Critical |
| E2E-TC-027 | Direct balance edit attempt | Blocked/alert | Critical |
| E2E-TC-028 | Client liabilities > assets | Freeze/escalate | Critical |
| E2E-TC-029 | Encumbered backing reused | Blocked | Critical |
| E2E-TC-030 | Journal hash-chain mismatch | Freeze/escalate | Critical |

## 6. Withdrawal / Payout Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| E2E-TC-031 | Valid payout to active whitelist | Reserve + execute + settle | Critical |
| E2E-TC-032 | Payout to revoked destination | Blocked | Critical |
| E2E-TC-033 | Payout with stale AML | Blocked | Critical |
| E2E-TC-034 | Payout exceeds live balance | Blocked | Critical |
| E2E-TC-035 | WLT decision consumed but LED execution fails | Hold handled, reconciliation case | Critical |

## 7. Exchange-Lock Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| E2E-TC-036 | Order book route enabled | Blocked by CFG/IAM/recon | Critical |
| E2E-TC-037 | Matching engine permission exists | Blocked by IAM/CFG | Critical |
| E2E-TC-038 | Client-to-client match simulated | Blocked by TRD/CFG | Critical |
| E2E-TC-039 | AIX spread markup enabled | Blocked by CFG/TRD/LED | Critical |
| E2E-TC-040 | Principal inventory account used for client fill | Blocked | Critical |

## 8. Audit / Reconciliation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| E2E-TC-041 | Critical action without SEC audit | Fails closed | Critical |
| E2E-TC-042 | Sensitive read without audit | Denied | Critical |
| E2E-TC-043 | Reconciliation break auto-cleared | Blocked | Critical |
| E2E-TC-044 | Duplicate source event | No double-post/fill | Critical |
| E2E-TC-045 | Same idempotency key different payload | Conflict rejected | Critical |
