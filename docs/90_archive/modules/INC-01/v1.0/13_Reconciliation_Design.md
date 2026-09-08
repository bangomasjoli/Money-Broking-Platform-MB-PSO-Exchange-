# INC-01 Incident / Freeze / Recovery
## 13 Reconciliation Design

## 1. Purpose

INC-01 must trigger and consume targeted REC-01 validation for incidents that affect client money/assets, ledger integrity, deposits, payouts, trades, audit evidence or regulatory reports.

---

## 2. Incident Reconciliation Requirements

| Incident Type | Required REC Validation |
|---|---|
| Safeguarding deficit | Safeguarding report + external statement trust |
| Ledger hash-chain issue | LED journal/hash-chain validation |
| Deposit incident | DEP receipt/source/finality/LED credit recon |
| Payout incident | WDR reserve/send/finality/LED settlement recon |
| Trade incident | TRD LP fill/client fill/LED settlement recon |
| Fee incident | Fee disclosure/posting recon |
| Audit event incident | SEC expected-vs-emitted recon |
| Vendor outage | Impacted flow/provider recon |
| AML/WLT revocation | Affected correlation recon |
| Report error | REC report restatement validation |

## 3. Resume Validation

Before resume:

1. affected correlations reconciled.
2. in-flight item dispositions validated.
3. no unresolved critical breaks for affected scope.
4. external provider states known or controlled.
5. ledger/safeguarding state validated.
6. SEC evidence complete.
