# DEP-01 Deposit Execution / Inbound Receipt
## 02 Workflow

## 1. Workflow Scope

DEP-01 workflows cover deposit intent, external receipt ingestion, authentication, deduplication, matching, source extraction, WLT/AML handoff, LED pending deposit handoff, quarantine, reversal/recall and reconciliation.

---

## 2. WF-DEP01-01 Deposit Intent Creation

### Trigger

Client requests deposit instruction.

### Steps

1. Verify CFG-01 deposit feature/licence gate.
2. Verify client status through CLT-01.
3. Verify KYC/AML eligibility where required.
4. Create deposit intent with correlation ID.
5. Generate deposit reference / virtual account / approved deposit address instruction.
6. Store intent and expected asset/currency.
7. Emit SEC-01 audit event.

### Rules

1. Deposit intent does not guarantee credit.
2. Deposit instruction must warn that credit occurs only after screening, confirmation and ledger approval.
3. Unsupported asset/chain/rail is blocked.

---

## 3. WF-DEP01-02 Receipt Ingestion

### Trigger

Bank/custodian/chain provider sends receipt event or polling job detects receipt.

### Steps

1. Receive source event.
2. Authenticate source/provider.
3. Validate payload schema.
4. Hash raw payload.
5. Apply deduplication/idempotency.
6. Store receipt as raw immutable evidence.
7. Extract source data.
8. Attach or create correlation ID.
9. Emit SEC-01 audit event.

### Fail-Closed

1. source unauthenticated.
2. malformed payload.
3. same event/different payload conflict.
4. unsupported provider.

---

## 4. WF-DEP01-03 Deposit Matching

### Trigger

Authenticated receipt is stored.

### Steps

1. Match against deposit intent/reference.
2. Match client-specific rail/address/tag/memo.
3. Compare amount, asset/currency, expected window.
4. Identify source account/wallet.
5. If one confident match, set matched_pending_screening.
6. If no match or multiple candidates, quarantine/unmatched queue.
7. Create LED-01 pending deposit record.
8. Emit SEC-01 audit event.

### Rules

1. Ambiguous match is never auto-credit.
2. No forced manual match without maker-checker.
3. Manual match still requires WLT/AML/LED controls.

---

## 5. WF-DEP01-04 Source Screening Handoff

### Trigger

Receipt matched or queued for screening.

### Steps

1. Prepare source metadata package.
2. Send inbound source to WLT-01.
3. Send AML source/counterparty request where required.
4. Receive WLT/AML outcomes.
5. If clear, update deposit screening status.
6. If hold/review/hit, quarantine and escalate.
7. Emit SEC-01 audit event.

---

## 6. WF-DEP01-05 Confirmation Tracking

### Trigger

Provider sends confirmation/update or polling detects new confirmation.

### Steps

1. Verify event authenticity.
2. Deduplicate confirmation update.
3. Update confirmation count/status.
4. For crypto, compare against threshold.
5. For fiat/custodian, compare finality/settlement status.
6. If sufficient and screening clear, request LED credit evaluation.
7. Emit SEC-01 audit event.

---

## 7. WF-DEP01-06 LED Pending Deposit / Credit Evaluation Handoff

### Steps

1. Create LED pending deposit as soon as receipt is authenticated and correlation exists.
2. Update LED pending deposit with match/screening/confirmation status.
3. When all required statuses are clear, request LED credit evaluation.
4. LED decides whether to credit based on backing/safeguarding/ledger controls.
5. Store LED deposit status and journal ref if credited.
6. Emit SEC-01 audit event.

### Rules

1. DEP-01 cannot post credit.
2. LED rejection keeps deposit pending/quarantined/exception.
3. LED credit is final only per LED status.

---

## 8. WF-DEP01-07 Quarantine / Exception

### Trigger

Deposit cannot safely proceed.

### Steps

1. Create quarantine case.
2. Set reason code.
3. Notify Operations/Compliance where appropriate.
4. Block credit evaluation until resolved.
5. Manual resolution requires maker-checker.
6. Preserve source evidence.
7. Emit SEC-01 audit event.

---

## 9. WF-DEP01-08 Reorg / Recall / Reversal

### Trigger

External source reports reversal/reorg/recall or polling detects reversal.

### Steps

1. Authenticate reversal event.
2. Match to original receipt/deposit.
3. Store reversal payload hash.
4. Notify LED-01 clawback/recall service.
5. Update deposit status.
6. Notify WLT/AML/E2E saga if required.
7. Emit SEC-01 audit event.

---

## 10. WF-DEP01-09 Reconciliation

### Scheduled Checks

1. external receipts vs DEP records.
2. DEP records vs WLT screening decisions.
3. DEP records vs AML decisions.
4. DEP records vs LED pending deposits.
5. credited deposits vs confirmed receipts.
6. recalled/reorged deposits vs LED clawback.
7. unmatched/quarantined SLA.
8. duplicate/replay events.
9. SEC expected-vs-emitted events.
10. E2E correlation completeness.
