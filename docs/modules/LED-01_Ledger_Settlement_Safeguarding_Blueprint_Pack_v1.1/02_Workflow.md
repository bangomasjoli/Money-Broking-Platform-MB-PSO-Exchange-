# LED-01 Ledger / Settlement / Safeguarding
## 02 Workflow

## 1. Workflow Scope

LED-01 workflows cover double-entry posting, deposits, withdrawals, prefunded holds, DvP settlement, WLT/AML gate consumption, fee posting, reversals, ledger close/freeze, reconciliation, safeguarding and exceptions.

---

## 2. WF-LED01-01 Journal Posting

### Trigger

A source module requests a financial posting.

### Steps

1. Receive posting request with source event ID and idempotency key.
2. Verify module/source is authorised.
3. Validate journal lines.
4. Verify debit total equals credit total.
5. Verify accounts and asset/currency.
6. Verify period not closed/frozen.
7. Verify no prohibited direct balance edit.
8. Apply idempotency and ordering guard.
9. Validate same key/same payload or reject same key/different payload.
10. Compute journal hash using previous journal hash.
11. Append immutable hash-sealed journal.
12. Update live balance version and derived balance snapshot if applicable.
13. Emit SEC-01 audit event.

### Rules

1. Unbalanced journal is rejected.
2. Duplicate source event returns prior result, not new posting.
3. Posted journal is never edited.

---

## 3. WF-LED01-02 Deposit Pending to Available Credit

### Trigger

Bank/custodian/chain deposit event received.

### Steps

1. Receive deposit event.
2. Create pending deposit record.
3. Match client/source/reference.
4. Verify WLT inbound source screening clear or approved.
5. Verify AML/KYC/client status.
6. Verify receipt confirmation threshold.
7. Atomically reserve confirmed unencumbered backing.
8. Verify preventive safeguarding invariant.
9. Post pending-to-available balanced journal.
10. Emit SEC-01 audit event.

### Fail-Closed

1. source unmatched.
2. source quarantined.
3. receipt unconfirmed.
4. AML/KYC/client restricted.
5. backing not verified.
6. duplicate source event.

---

## 4. WF-LED01-03 Withdrawal / Payout Reserve and Settlement

### Trigger

Withdrawal/payout/settlement module requests payout.

### Steps

1. Verify client status and mandate.
2. Verify live available balance using atomic reservation engine.
3. Consume WLT-01 verify-and-consume destination decision.
4. Verify AML-01 pre-transaction gate if required.
5. Create reserve/hold atomically against live balance and balance version.
6. Send settlement instruction to execution module/rail.
7. On confirmed execution, post settlement journal.
8. On failure, keep/release hold according to failure state.
9. Emit SEC-01 audit event.

### Rules

1. No payout without reserve.
2. No execution without WLT decision consumption.
3. No final debit without confirmed execution outcome.

---

## 5. WF-LED01-04 Prefunded Hold for LP Execution

### Trigger

Trade/LP module requests execution hold.

### Steps

1. Verify client and asset/currency.
2. Verify live available balance using atomic reservation engine.
3. Create hold for expected amount and tolerance atomically against live balance and balance version.
4. Return hold reference to trade/LP module.
5. LP execution can proceed only with active hold.
6. On execution outcome, consume hold into settlement.
7. Release unused balance or void/requote according to trade rules.
8. Emit SEC-01 audit event.

---

## 6. WF-LED01-05 DvP Settlement

### Steps

1. Validate active hold and LP execution result.
2. Confirm counter-asset/funds receipt where required.
3. Debit source asset from held balance.
4. Credit destination asset only after confirmed receipt.
5. Post balanced journal.
6. Release residual hold if permitted.
7. Verify no AIX exposure.
8. Emit SEC-01 audit event.

---

## 7. WF-LED01-06 Fee Posting

### Steps

1. Receive fee request with disclosure ref.
2. Validate fee schedule and fee type.
3. Verify available balance/settlement proceeds.
4. Post fee journal.
5. Emit SEC-01 audit event.

### Rules

1. No hidden spread.
2. No AIX markup.
3. Fee cannot create negative balance.

---

## 8. WF-LED01-07 Reversal / Correction

### Steps

1. User requests correction.
2. IAM-02 maker-checker approval.
3. Validate original journal.
4. Create reversal journal referencing original.
5. Create corrected journal if required.
6. Re-run safeguarding check.
7. Emit SEC-01 audit event.

---

## 9. WF-LED01-08 Ledger Close / Freeze

### Steps

1. Finance/Ops requests close or freeze.
2. IAM-02 approval.
3. Validate no unresolved critical breaks where policy blocks close.
4. Mark period/asset/client/module frozen or closed.
5. Reject new postings in frozen scope.
6. Emit SEC-01 audit event.

---

## 10. WF-LED01-09 Reconciliation

### Scheduled Checks

1. ledger accounts vs journal totals.
2. client liabilities vs safeguarded assets.
3. bank statement vs fiat ledger.
4. custodian statement vs asset ledger.
5. chain confirmed receipts vs deposit ledger.
6. holds vs trade/settlement records.
7. WLT decisions consumed vs settlement records.
8. AML decisions vs settlement records.
9. fees vs disclosure schedule.
10. reversals vs original journals.

---

## 11. WF-LED01-10 Safeguarding Breach

### Trigger

Full backing invariant breach or reconciliation critical break.

### Steps

1. Create critical exception.
2. Freeze affected asset/client/rail/module.
3. Notify Finance/Compliance/Security/Ops.
4. Block new movement in affected scope.
5. Preserve evidence.
6. Require root-cause and remediation approval.
7. Emit SEC-01 critical audit event.

---

## 12. WF-LED01-11 Atomic Reservation

### Trigger

Hold/reserve requested for payout, withdrawal, settlement or LP execution.

### Steps

1. Load authoritative live balance row for account/client/asset.
2. Acquire per-account serialisation lock or version.
3. Compute available balance from posted journals minus active holds using live state.
4. Verify scope not frozen/closed.
5. Verify requested hold <= live available.
6. Insert hold and increment balance version atomically.
7. If version changed, retry or fail according to policy.
8. Emit SEC-01 audit event.

### Rules

1. `balance_snapshot` cannot be used for reservation.
2. Concurrent overspend must be impossible by construction.

---

## 13. WF-LED01-12 Two-Leg DvP Settlement

### Trigger

Trade/LP or cross-asset settlement requires DvP.

### Steps

1. Create settlement group.
2. Create deliver leg and receive leg.
3. Pin related holds.
4. Confirm each leg according to rail/custodian/LP evidence.
5. If both legs meet conditions, atomically post settlement journal.
6. If one leg settles and the other is pending, move to one_leg_settled_other_pending.
7. If one leg fails, route compensating unwind to client/suspense position.
8. Verify no AIX inventory/exposure.
9. Emit SEC-01 audit event.

---

## 14. WF-LED01-13 Preventive Safeguarding / Backing Encumbrance

### Trigger

Deposit credit, withdrawal, payout, settlement, hold, release or conversion.

### Steps

1. Load safeguarded backing position for asset/currency.
2. Determine free and encumbered backing.
3. Atomically encumber or release backing according to movement.
4. Check client liabilities <= confirmed safeguarded assets.
5. If breach or unknown, block movement and freeze affected scope.
6. Emit SEC-01 audit event.

---

## 15. WF-LED01-14 Conversion and Residual Control

### Trigger

Trade/LP module settles cross-asset conversion.

### Steps

1. Receive conversion event with rate, source asset, target asset, amount and fee disclosure reference.
2. Validate linked A-out/B-in settlement legs.
3. Calculate exact expected amounts and sub-unit rounding.
4. Post residual to configured bounded residual account according to policy.
5. Verify AIX net asset position is zero after conversion.
6. Verify fee is disclosed brokerage/commission only.
7. Emit SEC-01 audit event.

---

## 16. WF-LED01-15 Journal Chain Verification and Anchoring

### Trigger

Scheduled job, ledger close, deployment, or suspicious integrity event.

### Steps

1. Read journal sequence by ledger partition.
2. Recompute each journal hash.
3. Verify previous hash linkage.
4. Verify external anchor where available.
5. If mismatch, freeze affected scope and create Critical exception.
6. Emit SEC-01 audit event.

---

## 17. WF-LED01-16 Post-Credit Clawback

### Trigger

Chain reorg, custodian reversal, fiat recall, ACH return or bank correction.

### Steps

1. Create clawback case.
2. Identify original credit journal.
3. Freeze affected amount/client if needed.
4. Post controlled reversal/new journal with approval where required.
5. If balance already spent, create shortfall exception and restrict client according to policy.
6. Re-run safeguarding invariant.
7. Emit SEC-01 audit event.

---

## 18. WF-LED01-17 Fee Settlement Atomicity

### Trigger

Settlement includes fee.

### Steps

1. Validate fee disclosure reference.
2. Include fee lines in same settlement journal where possible.
3. If separate fee journal is required, start compensated saga.
4. If fee posting fails, compensate/hold settlement according to policy.
5. Ensure no hidden spread/residual.
6. Emit SEC-01 audit event.
