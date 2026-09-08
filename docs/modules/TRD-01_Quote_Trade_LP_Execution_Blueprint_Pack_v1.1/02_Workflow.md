# TRD-01 Quote / Trade / LP Execution
## 02 Workflow

## 1. Workflow Scope

TRD-01 workflows cover quote request, LP quote, client quote, quote acceptance, prefunded hold, AML gate, LP execution, fill handling, slippage/requote, settlement handoff, expiration, cancellation, reconciliation and evidence export.

---

## 2. WF-TRD01-01 Quote Request

### Trigger

Client requests quote.

### Steps

1. Verify CFG-01 feature/licence gate.
2. Verify client status and class through CLT-01.
3. Verify KYC and AML current outcomes.
4. Verify client mandate and authorised trader.
5. Verify instrument/pair allowed.
6. Verify LP coverage.
7. Request LP quote from approved LP.
8. Verify LP quote source and payload hash.
9. Determine LP quote firmness: firm_executable or indicative.
10. Enforce `client_quote.valid_until_utc <= lp_quote.valid_until_utc`.
11. Build client quote with execution model and fee disclosure.
12. Validate price-construction identity.
13. Build quote hash covering LP quote ID, LP price, LP payload hash, fee disclosure and execution model.
14. Store quote and quote hash.
15. Return quote with expiry and contingent/firm-execution disclosure.
16. Emit SEC-01 audit event.

### Rules

1. No LP quote = no client quote.
2. Expired LP quote cannot build client quote.
3. Unapproved LP cannot quote.

---

## 3. WF-TRD01-02 Quote Acceptance

### Trigger

Client accepts quote.

### Steps

1. Load quote.
2. Verify quote not expired.
3. Verify quote hash.
4. Verify client status/mandate still valid.
5. Verify client-side dual authorisation where required.
6. Revalidate CFG-01 licence/feature lock.
7. Verify AML gate where required.
8. If firm execution model, atomically bind acceptance to executable LP quote or fail/requote.
9. If contingent model, record that client price is provisional until LP fill.
10. Request LED-01 prefunded hold.
11. Create trade in accepted/hold_created state using status_version compare-and-set.
12. Emit SEC-01 audit event.

### Rules

1. Quote acceptance without hold cannot progress to LP execution.
2. Duplicate acceptance returns same trade or rejects conflict.

---

## 4. WF-TRD01-03 LP Execution

### Trigger

Accepted quote with active LED hold.

### Steps

1. Verify active hold.
2. Revalidate CFG-01 licence/feature lock at execution time.
3. Verify LP status/coverage.
4. Verify quote still executable under contingent/firm model.
5. Verify no internalisation/netting route.
6. Record LP-selection / best-execution evidence.
7. Build LP execution request with idempotency key.
8. Send to approved external LP.
9. Store LP order reference and payload hash.
10. Move trade to execution_submitted using status_version compare-and-set.
11. Emit SEC-01 audit event.

### Fail-Closed

1. LP unavailable.
2. hold expired/released.
3. AML stale.
4. licence lock breach.
5. idempotency conflict.

---

## 5. WF-TRD01-04 Fill Processing

### Trigger

LP sends fill/update/reject/timeout.

### Steps

1. Verify LP message source and payload hash.
2. Verify LP order reference.
3. Apply idempotency/order guard.
4. Store LP update.
5. If timeout, start LP order-status query-back and move to reconcile_required.
6. If late fill arrives after void/released hold/terminal state, park exception and block settlement.
7. If filled, validate fill conservation and price-construction identity.
8. If filled, validate slippage/tolerance and pass positive slippage to client.
9. If partial, apply partial-fill policy and coordinate residual hold with LED-01.
10. If reject, release/void according to LED rules only after terminal state.
11. If accepted fill, create client fill only from conserved external LP fill evidence.
12. Send settlement handoff to LED-01 after CFG settlement revalidation.
13. Emit SEC-01 audit event.

---

## 6. WF-TRD01-05 Slippage / Requote / Void

### Steps

1. Compare LP fill price to accepted quote and tolerance.
2. If price improvement exists, pass improvement to client.
3. If within negative tolerance, allow fill subject to conservation.
4. If outside tolerance, block final fill.
5. Route to requote, void, or client confirmation.
6. Release unused hold atomically through LED-01 only at terminal state.
7. Requote requires new or adjusted LED hold.
8. Emit SEC-01 audit event.

---

## 7. WF-TRD01-06 Settlement Handoff

### Steps

1. Prepare settlement payload.
2. Include hold reference.
3. Include LP execution/fill refs.
4. Include conversion legs.
5. Include fee disclosure.
6. Include residual/rounding details.
7. Include evidence hash.
8. Revalidate CFG-01 licence/feature lock before handoff.
9. Send to LED-01.
10. Track LED acknowledgement and actual settlement outcome.
11. Update client confirmation only according to LED actual settlement status.
12. Emit SEC-01 audit event.

---

## 8. WF-TRD01-07 Expiry / Cancel / Timeout

### Steps

1. System checks expired quotes/trades.
2. Expire unaccepted quotes.
3. Cancel accepted but unexecuted trades according to state.
4. Release LED hold where terminal and permitted.
5. Timeout LP pending orders to reconciliation.
6. Emit audit event.

---

## 9. WF-TRD01-08 Reconciliation

### Scheduled Checks

1. client quote without LP quote.
2. accepted quote without hold.
3. LP execution without hold.
4. LP fill without client fill.
5. client fill without LP fill.
6. LP fill without LED settlement handoff.
7. settlement handoff without LED acknowledgement.
8. duplicate LP fill.
9. slippage outside tolerance accepted.
10. residual without LED policy reference.
11. fee without disclosure.
12. principal/inventory balance suspected.

---

## 10. WF-TRD01-09 LP Timeout Query-Back

### Trigger

LP execution request times out or LP response is indeterminate.

### Steps

1. Move trade to reconcile_required using status_version compare-and-set.
2. Keep LED hold pinned.
3. Send idempotent LP order-status query using client_order_ref.
4. If LP reports fill, process through fill conservation and settlement checks.
5. If LP reports no execution/reject, void or cancel trade and release hold through LED.
6. If LP remains unknown beyond SLA, escalate to Operations/Compliance with maker-checker resolution.
7. Block blind retry unless LP confirms prior order is not live.
8. Emit SEC-01 audit event.

---

## 11. WF-TRD01-10 Fill Conservation and Price Identity

### Trigger

External LP fill received or aggregated fill ready for client fill.

### Steps

1. Verify LP fill source and payload hash.
2. Verify LP fill is external approved LP evidence.
3. Verify LP fill quantity has not already been allocated.
4. For tranches, compute total quantity and VWAP.
5. Verify client fill quantity equals LP quantity/tranche sum.
6. Verify client execution price equals LP price/VWAP plus/minus disclosed fee only.
7. Verify positive slippage is passed to client.
8. Block unconserved fill.
9. Store conservation record and audit evidence.

---

## 12. WF-TRD01-11 No Internalisation / CFG Revalidation

### Trigger

Before LP execution and before settlement handoff.

### Steps

1. Revalidate CFG-01 licence/feature lock.
2. Verify Exchange-locked features remain disabled.
3. Verify execution route is approved external LP.
4. Verify no internal client order/crossing/netting route exists.
5. Verify no synthetic LP fill/order is used.
6. Fail closed on stale/revoked CFG decision.
7. Emit SEC-01 audit event.

---

## 13. WF-TRD01-12 LED Settlement Outcome Sync

### Trigger

LED-01 settlement acknowledgement, settlement confirmation, settlement failure or reversal is received.

### Steps

1. Verify LED settlement event source and payload hash.
2. Match to settlement handoff/trade/fill.
3. Update trade settlement status using compare-and-set.
4. Create or update client confirmation:
   - executed_pending_settlement.
   - settled.
   - settlement_failed.
   - corrected.
5. If LED settlement fails, freeze/reconcile trade and notify client using safe status.
6. Emit SEC-01 audit event.
