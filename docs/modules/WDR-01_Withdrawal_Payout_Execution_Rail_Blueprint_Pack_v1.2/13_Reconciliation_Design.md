# WDR-01 Withdrawal / Payout Execution Rail
## 13 Reconciliation Design

## 1. Purpose

WDR-01 reconciliation proves every outbound instruction is backed by a coherent decision bundle, active LED reserve, valid provider evidence, finality evidence, and LED outcome.

## 2. Reconciliation Types

| Reconciliation | Source A | Source B | Purpose |
|---|---|---|---|
| Execution request vs decision bundle | payout_execution | decision_bundle | Control completeness |
| WLT/AML/LED decisions | decision_bundle | source modules | Freshness and coherence |
| Provider instruction vs request | provider_instruction | payout_execution | Instruction mapping |
| Provider status vs instruction | provider_status_event | provider_instruction | Rail evidence |
| Finality vs LED outcome | finality_record | LED settlement | Settlement truth |
| Return/reversal vs LED notification | return_reversal_case | LED clawback/failure | Recovery |
| Audit manifest | expected events | SEC events | Evidence completeness |
| E2E saga | correlation | evidence bundle | Orphan detection |

## 3. Scheduled Jobs

1. Payout without decision bundle.
2. Payout without WLT decision.
3. Payout without AML gate.
4. Payout without LED reserve.
5. Provider instruction without approval/bundle.
6. Timeout unresolved beyond SLA.
7. Provider finality without LED notification.
8. LED settlement without provider finality.
9. Return/reversal without LED notification.
10. Duplicate provider instruction.
11. Duplicate provider event.
12. SEC event gap.
13. E2E orphan instruction.

## 4. Critical Findings

1. instruction without reserve.
2. instruction without WLT/AML.
3. operational funding suspected.
4. provider timeout blind retry.
5. premature finality.
6. ignored return/reversal.
7. reserve locally released by WDR.
8. sanctioned return without review.

## v1.1 Additional Reconciliation

Additional scheduled jobs:

1. instruction submitted without send-time revalidation.
2. reserve send lock duplicate.
3. logical payout duplicate.
4. payout value conservation mismatch.
5. beneficiary hash mismatch vs WLT canonical destination.
6. high-value payout missing beneficiary verification.
7. Travel Rule sent payload mismatch.
8. batch envelope without item finality.
9. batch checksum/manifest mismatch.
10. successful batch item resent.
11. provider signing key expired/revoked at use.
12. payout status unknown beyond SLA.
13. executed-late not notified to LED.
14. client paid status without rail finality + LED outcome.

Critical findings:

1. stale bundle at irreversible send.
2. one reserve funds two sends.
3. beneficiary alteration.
4. batch partial failure mishandled.
5. value delta absorbed by AIX.
6. false client payout status.
