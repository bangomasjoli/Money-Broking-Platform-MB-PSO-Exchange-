# LED-01 Ledger / Settlement / Safeguarding
## 15 Regulatory Mapping

## 1. Control Mapping

| LED-01 Control | Master Control / Rule Area | Tests |
|---|---|---|
| Double-entry immutable ledger | LEDGER-RULE-001, SEC-RULE-001 | LED1-TC-001-006 |
| Deposit pending/credit | SAFEGUARD-RULE-001, FUND-RULE-001 | LED1-TC-007-012 |
| Withdrawal/payout reserve | FUND-RULE-001, AML-RULE-001 | LED1-TC-013-018 |
| Prefunded hold | TRADE-RULE-001, FUND-RULE-001 | LED1-TC-019-022 |
| DvP sequencing | SETTLE-RULE-001 | LED1-TC-023-025 |
| Full backing | SAFEGUARD-RULE-001 | LED1-TC-026-027 |
| Fee disclosure | LIC-RULE-001, FEE-RULE-001 | LED1-TC-028-029 |
| Reversal/correction | GOV-RULE-001, SEC-RULE-001 | LED1-TC-030-032 |
| Close/freeze | OPS-RULE-001, SEC-RULE-001 | LED1-TC-033-034 |
| Reconciliation | SYS-RULE-001, SAFEGUARD-RULE-001 | LED1-TC-035-039 |
| Environment separation | DEPLOY-RULE-001 | LED1-TC-040 |

---

## 2. Workflow Mapping

| Workflow | Tests |
|---|---|
| WF-LED01-01 Journal Posting | LED1-TC-001-006 |
| WF-LED01-02 Deposit Credit | LED1-TC-007-012 |
| WF-LED01-03 Withdrawal/Payout | LED1-TC-013-018 |
| WF-LED01-04 Prefunded Hold | LED1-TC-019-022 |
| WF-LED01-05 DvP Settlement | LED1-TC-023-025 |
| WF-LED01-06 Fee Posting | LED1-TC-028-029 |
| WF-LED01-07 Reversal | LED1-TC-030-032 |
| WF-LED01-08 Close/Freeze | LED1-TC-033-034 |
| WF-LED01-09 Reconciliation | LED1-TC-035-040 |
| WF-LED01-10 Safeguarding Breach | LED1-TC-027,035 |

---

## 3. Regulatory Support

LED-01 supports:

1. immutable ledger evidence.
2. client-money/client-asset safeguarding.
3. full-backing invariant.
4. prefunded execution.
5. DvP settlement.
6. no principal exposure.
7. fee transparency.
8. reconciliation evidence.
9. audit/regulatory reporting.
