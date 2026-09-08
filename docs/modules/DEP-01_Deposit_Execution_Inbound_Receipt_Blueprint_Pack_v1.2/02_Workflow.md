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
7. Generate unique-per-intent reference/address/tag where supported.
8. Record address/reference reuse policy if reused rail/address applies.
9. Emit SEC-01 audit event.

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
4. Verify provider identity using signing/HMAC/mTLS/key policy.
5. Verify file feed sequence/completeness where applicable.
6. Hash raw payload.
7. Apply deduplication/idempotency.
8. Store receipt as raw immutable evidence.
9. Extract source data.
10. Attach or create correlation ID.
11. Reconcile against independent bank/chain/custodian truth where required.
12. Emit SEC-01 audit event.

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
5. Verify intent active and not expired/cancelled.
6. Apply amount disposition policy for exact/partial/over/under/dust.
7. If one confident active match, set matched_pending_screening.
8. If no match, expired intent, multiple candidates, wrong memo/tag or unexpected amount, quarantine/unmatched queue.
9. Create LED-01 pending deposit only after match, or create sweepable unmatched pending if operationally required.
10. Emit SEC-01 audit event.

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
4. Send source-of-funds / own-source binding request using KYC verified source data where available.
5. Capture inbound Travel Rule data where source is VASP/applicable.
6. Receive WLT/AML outcomes.
7. If clear and own-source/approved-source passes, update deposit screening status.
8. If third-party/unexpected source, hold/review/hit, quarantine and escalate.
9. Emit SEC-01 audit event.

---

## 6. WF-DEP01-05 Confirmation Tracking

### Trigger

Provider sends confirmation/update or polling detects new confirmation.

### Steps

1. Verify event authenticity.
2. Deduplicate confirmation update.
3. Update confirmation count/status.
4. For crypto, apply chain-specific finality model, reorg-depth policy and corroboration requirement.
5. For fiat/custodian, apply settlement/finality status and return/recall-window policy.
6. If finality sufficient and screening clear, proceed to credit-request bundle revalidation.
7. If finality insufficient, keep pending or quarantine according to policy.
8. Emit SEC-01 audit event.

---

## 7. WF-DEP01-06 LED Pending Deposit / Credit Evaluation Handoff

### Steps

1. Create LED pending deposit as soon as receipt is authenticated and correlation exists.
2. Update LED pending deposit with match/screening/confirmation status.
3. Immediately before credit evaluation, revalidate coherent bundle:
   - WLT decision current.
   - AML decision current.
   - finality evidence current.
   - client eligibility current.
   - amount/asset/client/correlation match.
   - no revocation signal.
4. If bundle passes, request LED credit evaluation.
5. LED decides whether to credit based on backing/safeguarding/ledger controls.
6. Store LED deposit status and journal ref if credited.
7. Emit SEC-01 audit event.

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

---

## 11. WF-DEP01-10 AML/WLT Revocation Handling

### Trigger

AML-01 or WLT-01 sends revocation/new-hit/list-update signal affecting an in-flight deposit.

### Steps

1. Match signal to deposit by source, client, correlation, wallet/account, amount or decision ref.
2. Mark deposit as quarantined/review_required.
3. Cancel or block pending LED credit evaluation.
4. If LED credit already occurred, notify LED-01 clawback/restriction workflow.
5. Update E2E saga.
6. Emit SEC-01 audit event.

---

## 12. WF-DEP01-11 Credit-Request Bundle Revalidation

### Trigger

Deposit appears ready for LED credit evaluation.

### Steps

1. Load deposit, receipt, match, source, confirmation and handoff records.
2. Create point-in-time eligibility snapshot.
3. Revalidate WLT decision.
4. Revalidate AML decision.
5. Verify finality model status.
6. Verify client eligibility and freeze status.
7. Verify amount disposition status.
8. Verify source-of-funds status.
9. Verify all records share same correlation/client/amount/asset.
10. If valid, request LED credit evaluation.
11. If invalid/stale/revoked, quarantine.

---

## 13. WF-DEP01-12 Controlled Return Path

### Trigger

Unmatched/rejected deposit requires return or remediation.

### Steps

1. Create return/remediation case.
2. Check whether source is sanctioned/frozen/high-risk.
3. If return is permitted, route through WLT/AML/LED payout controls.
4. If return is prohibited or risky, escalate to Compliance/legal.
5. Preserve original deposit evidence.
6. Emit SEC-01 audit event.
