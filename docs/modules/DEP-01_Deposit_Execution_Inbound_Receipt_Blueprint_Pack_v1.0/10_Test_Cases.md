# DEP-01 Deposit Execution / Inbound Receipt
## 10 Test Cases

## 1. Deposit Intent Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| DEP1-TC-001 | Eligible client creates deposit intent | Intent created with correlation | Critical |
| DEP1-TC-002 | Suspended client creates deposit intent | Rejected | Critical |
| DEP1-TC-003 | Unsupported rail/asset | Rejected | Critical |
| DEP1-TC-004 | Deposit instruction implies guaranteed credit | Blocked/content fail | High |

## 2. Receipt Ingestion Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| DEP1-TC-005 | Authenticated fiat receipt | Stored with payload hash | Critical |
| DEP1-TC-006 | Authenticated chain receipt | Stored with tx hash | Critical |
| DEP1-TC-007 | Unauthenticated receipt | Rejected | Critical |
| DEP1-TC-008 | Same event same payload | Idempotent existing result | Critical |
| DEP1-TC-009 | Same event different payload | Conflict/alert | Critical |
| DEP1-TC-010 | Duplicate chain confirmation | Confirmation update only | Critical |

## 3. Matching Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| DEP1-TC-011 | Single confident match | matched_pending_screening | Critical |
| DEP1-TC-012 | No match | Unmatched queue | Critical |
| DEP1-TC-013 | Multiple clients match | Quarantine | Critical |
| DEP1-TC-014 | Source account mismatch | Quarantine | Critical |
| DEP1-TC-015 | Manual match without maker-checker | Blocked | Critical |

## 4. Screening / Confirmation / LED Handoff Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| DEP1-TC-016 | WLT source clear + AML clear + sufficient confirmation | LED credit evaluation requested | Critical |
| DEP1-TC-017 | WLT source hold | Quarantine, no credit request | Critical |
| DEP1-TC-018 | AML hit | Quarantine/escalate | Critical |
| DEP1-TC-019 | Crypto confirmations below threshold | Pending, no credit request | Critical |
| DEP1-TC-020 | LED pending deposit missing | Create/retry, no credit finality | Critical |
| DEP1-TC-021 | LED rejects credit evaluation | Hold/exception | Critical |

## 5. No-Credit / Reversal Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| DEP1-TC-022 | DEP attempts ledger credit | Blocked/alert | Critical |
| DEP1-TC-023 | Available balance table added in DEP | Build/design fail | Critical |
| DEP1-TC-024 | Chain reorg after credit | LED clawback notified | Critical |
| DEP1-TC-025 | Fiat recall after credit | LED clawback notified | Critical |
| DEP1-TC-026 | Reversal event ignored | Critical finding | Critical |

## 6. Reconciliation / E2E Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| DEP1-TC-027 | Receipt without DEP record | Recon break | Critical |
| DEP1-TC-028 | DEP record without LED pending | Recon break | Critical |
| DEP1-TC-029 | Credited deposit without confirmed receipt | Critical break | Critical |
| DEP1-TC-030 | Credited deposit without WLT/AML clear | Critical break | Critical |
| DEP1-TC-031 | Missing correlation ID | Block/critical finding | Critical |
| DEP1-TC-032 | Missing SEC expected event | Critical break | Critical |
| DEP1-TC-033 | Orphan pending deposit past SLA | Sweeper/escalation | Critical |

## 7. Go-Live Criteria

```txt
deposit_intent_tests_passed = true
receipt_ingestion_tests_passed = true
matching_tests_passed = true
screening_confirmation_led_tests_passed = true
no_credit_reversal_tests_passed = true
reconciliation_e2e_tests_passed = true
critical_control_coverage = 100_percent
```
