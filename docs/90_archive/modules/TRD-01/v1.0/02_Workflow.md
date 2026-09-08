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
9. Build client quote with fee disclosure.
10. Store quote and quote hash.
11. Return quote with expiry.
12. Emit SEC-01 audit event.

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
6. Verify AML gate where required.
7. Request LED-01 prefunded hold.
8. Create trade in accepted/hold_created state.
9. Emit SEC-01 audit event.

### Rules

1. Quote acceptance without hold cannot progress to LP execution.
2. Duplicate acceptance returns same trade or rejects conflict.

---

## 4. WF-TRD01-03 LP Execution

### Trigger

Accepted quote with active LED hold.

### Steps

1. Verify active hold.
2. Verify LP status/coverage.
3. Verify quote still executable under policy.
4. Build LP execution request with idempotency key.
5. Send to approved LP.
6. Store LP order reference and payload hash.
7. Move trade to execution_submitted.
8. Emit SEC-01 audit event.

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
5. If filled, validate slippage/tolerance.
6. If partial, apply partial-fill policy.
7. If reject, release/void according to LED rules.
8. If timeout, mark pending_reconciliation.
9. If accepted fill, create client fill.
10. Send settlement handoff to LED-01.
11. Emit SEC-01 audit event.

---

## 6. WF-TRD01-05 Slippage / Requote / Void

### Steps

1. Compare LP fill price to accepted quote and tolerance.
2. If within tolerance, allow fill.
3. If outside tolerance, block final fill.
4. Route to requote, void, or client confirmation.
5. Release unused hold where terminal.
6. Emit SEC-01 audit event.

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
8. Send to LED-01.
9. Track acknowledgement.
10. Emit SEC-01 audit event.

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
