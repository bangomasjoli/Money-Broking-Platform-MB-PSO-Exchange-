# WLT-01 Wallet Screening / Payout Destination Whitelist
## 15 Regulatory Mapping

## 1. Control Mapping

| WLT-01 Control | Master Control / Rule Area | Tests |
|---|---|---|
| Wallet registration/screening | AML-RULE-001, WLT-RULE-001 | WLT1-TC-001-008 |
| Payout beneficiary verification | PSO-RULE-001, AML-RULE-001 | WLT1-TC-009-014 |
| Whitelist approval/cooling-off | GOV-RULE-001, SOD-RULE-001 | WLT1-TC-015-020 |
| Destination use gate | FUND-RULE-001, AML-RULE-001 | WLT1-TC-021-027 |
| AML-01 pre-transaction gate | AML-RULE-001 | WLT1-TC-021,024 |
| Travel Rule data support | TRAVEL-RULE-001 | WLT1-TC-025 |
| Revocation/rescreening | AML-RULE-001, OPS-RULE-001 | WLT1-TC-028-033 |
| Sensitive access | SEC-RULE-001, DATA-RULE-001 | WLT1-TC-034-035 |
| Reconciliation | SYS-RULE-001, SEC-RULE-001 | WLT1-TC-036-040 |

---

## 2. Workflow Mapping

| Workflow | Tests |
|---|---|
| WF-WLT01-01 Wallet Registration | WLT1-TC-001-004 |
| WF-WLT01-02 Wallet Screening | WLT1-TC-005-008 |
| WF-WLT01-03 Payout Destination Registration | WLT1-TC-009-014 |
| WF-WLT01-04 Whitelist Approval/Cooling-Off | WLT1-TC-015-020 |
| WF-WLT01-05 Destination Use Gate | WLT1-TC-021-027 |
| WF-WLT01-06 Revocation | WLT1-TC-028-032 |
| WF-WLT01-07 Ongoing Rescreening | WLT1-TC-031-033 |
| WF-WLT01-08 Sensitive Read / Export | WLT1-TC-034-035 |
| WF-WLT01-09 Reconciliation | WLT1-TC-036-040 |

---

## 3. Regulatory Support

WLT-01 supports:

1. Destination whitelist before movement.
2. AML/CFT wallet screening.
3. Payout beneficiary verification.
4. Travel Rule destination data support.
5. Client mandate and dual authorisation.
6. Cooling-off and fraud control.
7. Revocation after AML/KYC/client-status hit.
8. Evidence for audit/regulatory review.
9. Prevention of unapproved fund/asset destination use.
