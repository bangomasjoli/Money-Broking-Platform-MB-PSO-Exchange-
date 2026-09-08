# WDR-01 Withdrawal / Payout Execution Rail
## 02 Workflow

## 1. Workflow Scope

WDR-01 workflows cover outbound execution intake, decision-bundle validation, WLT/AML/LED/CFG/IAM checks, provider routing, instruction transmission, timeout query-back, finality, return/reversal, cancellation, freeze handling and reconciliation.

---

## 2. WF-WDR01-01 Execution Intake

### Trigger

Authorised payout/withdrawal execution request is received.

### Steps

1. Receive execution request with correlation ID.
2. Validate source module/workflow.
3. Verify request payload hash and idempotency key.
4. Validate client, amount, asset, destination and action.
5. Create payout execution record.
6. Emit SEC-01 audit event.

### Rules

1. WDR cannot originate payout without authorised source.
2. Request without correlation ID is rejected.
3. Request from unsupported source workflow is rejected.

---

## 3. WF-WDR01-02 Decision Bundle Validation

### Steps

1. Revalidate CFG-01 licence/feature/kill-switch.
2. Verify IAM-02 permission/maker-checker/client dual-auth.
3. Verify CLT/KYC eligibility snapshot where included.
4. Verify WLT-01 verify-and-consume destination decision.
5. Verify AML-01 pre-transaction gate.
6. Verify Travel Rule status where applicable.
7. Verify LED-01 reserve/hold active and matching.
8. Verify all decisions share same correlation/client/amount/asset/destination/action.
9. Fail closed on stale/revoked/mismatched decision.
10. Emit SEC-01 audit event.

---

## 4. WF-WDR01-03 Provider Routing and Instruction Build

### Steps

1. Select approved rail/provider by asset/currency/destination.
2. Verify provider active and permitted.
3. Build provider instruction payload.
4. Validate payload destination, amount, asset, reference and Travel Rule payload.
5. Sign/authenticate instruction using approved key/credential reference.
6. Store payload hash.
7. Emit SEC-01 audit event.

---

## 5. WF-WDR01-04 External Instruction Transmission

### Steps

1. Submit instruction via API/file/custodian/chain rail.
2. Store provider instruction ID and acknowledgement.
3. Update status to submitted/acknowledged/processing.
4. If timeout, move to reconcile_required and start query-back.
5. Emit SEC-01 audit event.

### Rules

1. Timeout cannot be blindly retried.
2. Same idempotency key/different payload rejects.
3. Duplicate provider acknowledgement cannot create duplicate settlement.

---

## 6. WF-WDR01-05 Query-Back / Unknown Status

### Trigger

Provider response timeout, unknown or inconsistent.

### Steps

1. Hold payout in reconcile_required.
2. Query provider by instruction ID / idempotency reference.
3. If provider reports executed, wait for finality and notify LED.
4. If provider reports rejected/failed, notify LED failure.
5. If unknown beyond SLA, escalate to Operations/Finance/Compliance.
6. Keep LED reserve pinned until LED decides.
7. Emit SEC-01 audit event.

---

## 7. WF-WDR01-06 Finality / Settlement Outcome

### Trigger

Provider sends status update or polling detects finality.

### Steps

1. Authenticate provider update.
2. Verify update matches instruction.
3. Apply rail/provider finality model.
4. If final, notify LED-01 settlement outcome.
5. If failed/returned/reversed, notify LED-01 failure/reversal.
6. Update client/staff status via downstream portal/reporting.
7. Emit SEC-01 audit event.

---

## 8. WF-WDR01-07 Return / Reversal Handling

### Trigger

Provider reports return, reversal, recall or rejected beneficiary.

### Steps

1. Authenticate return/reversal event.
2. Match to original payout/correlation/saga.
3. Preserve provider evidence.
4. Notify LED-01 to determine ledger treatment.
5. Notify AML/WLT/E2E saga if risk-relevant.
6. Do not release reserve or re-credit client balance locally.
7. Emit SEC-01 audit event.

---

## 9. WF-WDR01-08 Cancellation

### Trigger

Cancellation request before irreversible finality.

### Steps

1. Verify cancellation allowed by provider/rail state.
2. Verify IAM-02 maker-checker where manual.
3. Submit cancellation request.
4. Query provider confirmation.
5. Notify LED-01 of cancellation outcome.
6. Handle late execution after cancellation as exception.
7. Emit SEC-01 audit event.

---

## 10. WF-WDR01-09 Freeze / Kill-Switch Handling

### Trigger

CFG kill-switch, AML freeze, CLT client freeze, WLT revocation or manual incident freeze.

### Steps

1. Block new payout instructions.
2. Identify in-flight payouts within scope.
3. Stop next forward action where possible.
4. Query/cancel provider if possible.
5. For irreversible state, quarantine/escalate.
6. Notify LED-01 and E2E saga.
7. Resume only after recovery gate.
8. Emit SEC-01 audit event.

---

## 11. WF-WDR01-10 Reconciliation

### Scheduled Checks

1. payout request without WLT decision.
2. payout request without AML gate.
3. payout request without LED reserve.
4. provider instruction without decision bundle.
5. provider acknowledgement without WDR instruction.
6. WDR finality without LED settlement outcome.
7. LED settlement without provider finality.
8. timeout unresolved beyond SLA.
9. duplicate instruction.
10. return/reversal without LED notification.
11. SEC expected-vs-emitted event gap.
12. E2E correlation completeness.
