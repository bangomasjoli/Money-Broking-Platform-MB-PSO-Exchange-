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


## 7. v1.1 Credit Bundle / Revocation Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| DEP1-TC-034 | WLT clear stored but revoked before credit request | Quarantine, no LED credit request | Critical |
| DEP1-TC-035 | AML clear stale at credit request | Bundle rejected | Critical |
| DEP1-TC-036 | WLT/AML decisions have different correlation IDs | Bundle rejected | Critical |
| DEP1-TC-037 | Confirmation clear but AML revoked | Quarantine | Critical |
| DEP1-TC-038 | Revocation after LED credit | LED clawback/restriction notified | Critical |

## 8. v1.1 Source-of-Funds / Own-Source Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| DEP1-TC-039 | Deposit from KYC-verified own account | Proceeds to screening/finality | Critical |
| DEP1-TC-040 | Deposit from third-party account | SoF review, no auto-credit | Critical |
| DEP1-TC-041 | Large first deposit without SoF/SoW evidence | Hold/review | Critical |
| DEP1-TC-042 | Third-party source approved with evidence | Proceeds subject to AML/WLT/LED | High |

## 9. v1.1 Finality / Provider Authenticity Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| DEP1-TC-043 | Crypto confirmations sufficient but reorg-depth model fails | Pending/hold | Critical |
| DEP1-TC-044 | Crypto indexer says confirmed but corroboration fails | Hold/review | Critical |
| DEP1-TC-045 | Fiat marked settled but return window open | Pending/risk review, no economic-final unless approved | Critical |
| DEP1-TC-046 | Provider webhook signed by expired key | Rejected/alert | Critical |
| DEP1-TC-047 | Bank file sequence gap | Reconciliation break / hold | Critical |
| DEP1-TC-048 | Webhook receipt not corroborated by bank/chain truth | No LED credit request | Critical |

## 10. v1.1 Matching / Amount / Return Path Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| DEP1-TC-049 | Deposit to expired intent | Quarantine/review | Critical |
| DEP1-TC-050 | Reused address with missing memo | Quarantine/review | Critical |
| DEP1-TC-051 | Overpayment above policy threshold | Review/SoF, no silent credit | Critical |
| DEP1-TC-052 | Underpayment/partial deposit | Disposition policy applied | High |
| DEP1-TC-053 | Dust below minimum | Policy disposition, no silent available credit | High |
| DEP1-TC-054 | Unmatched deposit auto-return attempt | Blocked; route payout controls | Critical |
| DEP1-TC-055 | Return to sanctioned source | Compliance/legal escalation, no auto-return | Critical |

## 11. v1.1 Corrections / Governance Tests

| Test ID | Scenario | Expected Result | Priority |
|---|---|---|---|
| DEP1-TC-056 | LED pending created for unmatched receipt and not swept | Critical orphan finding | Critical |
| DEP1-TC-057 | Client suspended after intent before receipt | Quarantine at credit request | Critical |
| DEP1-TC-058 | Inbound VASP transfer missing Travel Rule data | Hold/AML review | Critical |
| DEP1-TC-059 | Confirmation threshold changed outside CFG-01 | Blocked | Critical |
| DEP1-TC-060 | Reversal missing original correlation | Rejected/escalated | Critical |
| DEP1-TC-061 | Reversal carries original correlation/saga | LED clawback traceable | Critical |
| DEP1-TC-062 | SEC event missing for revocation pullback | Critical break | Critical |
| DEP1-TC-063 | Evidence bundle cannot show original receipt + reversal | Go-live fail | Critical |
| DEP1-TC-064 | Same source event different payload with provider key valid | Conflict/alert | Critical |
| DEP1-TC-065 | Manual match to expired intent without approval | Blocked | Critical |
| DEP1-TC-066 | Credit evaluation requested before own-source check | Blocked | Critical |
| DEP1-TC-067 | Credit evaluation requested before finality model complete | Blocked | Critical |

---

## 12. Go-Live Criteria

```txt
deposit_intent_tests_passed = true
receipt_ingestion_tests_passed = true
matching_tests_passed = true
screening_confirmation_led_tests_passed = true
no_credit_reversal_tests_passed = true
reconciliation_e2e_tests_passed = true
credit_bundle_revocation_tests_passed = true
source_of_funds_tests_passed = true
finality_provider_tests_passed = true
matching_amount_return_tests_passed = true
governance_correction_tests_passed = true
critical_control_coverage = 100_percent
```
