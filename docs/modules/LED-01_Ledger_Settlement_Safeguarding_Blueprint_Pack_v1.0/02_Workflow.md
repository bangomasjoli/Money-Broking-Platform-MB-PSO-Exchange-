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
9. Append immutable journal.
10. Update derived balance snapshot if applicable.
11. Emit SEC-01 audit event.

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
7. Verify safeguarding/backing.
8. Post pending-to-available balanced journal.
9. Emit SEC-01 audit event.

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
2. Verify available balance.
3. Consume WLT-01 verify-and-consume destination decision.
4. Verify AML-01 pre-transaction gate if required.
5. Create reserve/hold.
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
2. Verify available balance.
3. Create hold for expected amount and tolerance.
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
