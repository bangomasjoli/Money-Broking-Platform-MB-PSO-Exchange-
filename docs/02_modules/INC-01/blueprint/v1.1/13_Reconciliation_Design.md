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

## 4. v1.1 Resume Validation Additions

Before resume, REC validation must prove:

1. every incident-scoped in-flight item has terminal corrected disposition.
2. incident-scoped value position restored to zero or accepted.
3. safeguarding intact.
4. no unresolved critical break for affected scope.
5. E2E saga compensation state matches INC disposition.
6. freeze collateral / client-access consequence reviewed.

## 5. v1.1 Freeze Effectiveness Evidence

REC/SEC evidence pack must include:

1. freeze command.
2. module acknowledgement.
3. module effectiveness proof.
4. fail-closed ack-gap evidence.
5. overlapping freeze-hold status.
6. release approval and resume gate.
