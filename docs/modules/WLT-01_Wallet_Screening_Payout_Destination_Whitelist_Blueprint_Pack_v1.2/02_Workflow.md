# WLT-01 Wallet Screening / Payout Destination Whitelist
## 02 Workflow

## 1. Workflow Scope

WLT-01 workflows cover wallet registration, wallet screening, fiat payout destination verification, whitelist approval, cooling-off, activation, destination use gate, revocation, ongoing rescreening, Travel Rule data support and reconciliation.

---

## 2. WF-WLT01-01 Wallet Registration

### Trigger

Client/staff requests wallet address registration.

### Steps

1. Verify client status through CLT-01.
2. Verify CFG-01 feature gate.
3. Verify client mandate and authorised user.
4. Capture chain/network/address.
5. Resolve any name-service alias to raw address; do not store alias as authoritative destination.
6. Canonicalise address using chain-specific checksum/case/format rules.
7. Require full-address reconfirmation by client.
8. Screen for scam/lookalike/address-poisoning indicators where supported.
9. Capture ownership/control evidence where required.
10. For unhosted wallet, require proof-of-control unless approved exception applies.
11. Create wallet destination record.
12. Set status to pending_screening.
13. Emit SEC-01 audit event.

### Rules

1. Registration is not whitelist activation.
2. Address must be exact chain/network scoped.
3. Private keys are never requested or stored.

---

## 3. WF-WLT01-02 Wallet Screening

### Steps

1. Load wallet destination.
2. Verify chain/network support.
3. Send address to approved wallet analytics provider.
4. Verify vendor source and payload hash.
5. Store risk score/categories/exposure.
6. Call AML-01 for sanctions/Travel Rule where required.
7. Compute wallet risk outcome.
8. If high-risk/hit, route to Compliance review or reject.
9. Emit SEC-01 audit event.

---

## 4. WF-WLT01-03 Fiat Payout Destination Registration

### Steps

1. Verify client status and mandate.
2. Capture bank/rail/currency/country.
3. Capture account number/IBAN/routing reference.
4. Capture beneficiary name and relationship.
5. Verify beneficiary ownership/match using KYC/CLT data.
6. Screen beneficiary/country using AML-01.
7. Create payout destination record.
8. Set status to pending_review.
9. Emit SEC-01 audit event.

---

## 5. WF-WLT01-04 Whitelist Approval and Cooling-Off

### Steps

1. Reviewer verifies screening outcome and evidence.
2. IAM-02 maker-checker approval.
3. Client-side dual authorisation where mandate requires.
4. Compliance approval for high-risk/third-party/exception.
5. Set whitelist status to approved_pending_cooling.
6. Start cooling-off timer.
7. Notify client where safe.
8. After cooling-off, activate whitelist if no new risk hit.
9. Emit SEC-01 audit event.

### Rules

1. Approval does not bypass cooling-off unless approved override.
2. Activation must re-check client status, AML status and revocation state.

---

## 6. WF-WLT01-05 Destination Use Gate

### Trigger

Withdrawal, payout, settlement, transfer, deposit attribution or Travel Rule-related action wants to use destination.

### Steps

1. Receive destination-use request.
2. Verify destination active.
3. Verify destination belongs to client/action scope.
4. Verify client status and mandate.
5. Verify destination decision not stale/revoked.
6. Enforce value/velocity/concentration and first-use controls.
7. Call/verify AML-01 pre-transaction gate.
8. Verify Travel Rule data completeness where required.
9. Issue short-lived destination decision token bound to amount, action, scope, revocation epoch and limits version.
10. Return allow/deny/hold.
11. Emit SEC-01 audit event.

### Fail-Closed Conditions

1. Destination not whitelisted.
2. Whitelist cooling-off active.
3. Destination revoked/expired.
4. AML decision stale/missing/revoked.
5. Travel Rule data missing.
6. Client/mandate restricted.
7. Vendor risk result stale/invalid.
8. Scope mismatch.
9. Limit breach.
10. Token revocation epoch mismatch.
11. Unsupported chain/provider coverage.

---

## 7. WF-WLT01-06 Revocation

### Trigger

AML/KYC/CLT/mandate/vendor/manual trigger requires destination revocation.

### Steps

1. Receive revocation trigger.
2. Mark destination revoked/restricted immediately.
3. Invalidate decision tokens.
4. Notify downstream modules.
5. Notify client where safe and not tipping-off.
6. Emit SEC-01 audit event.
7. Reconciliation verifies no downstream use.

---

## 8. WF-WLT01-07 Ongoing Rescreening

### Trigger

Periodic schedule, AML list update, wallet analytics update, chain risk update, Travel Rule policy update, client profile change, mandate change or manual trigger.

### Steps

1. Identify affected destinations.
2. Set status to rescreening/review where policy requires.
3. Re-run wallet/bank/AML screening.
4. If clear, update validity.
5. If hit/risk increase, revoke/restrict.
6. Publish status to downstream modules.
7. Emit audit event.

---

## 9. WF-WLT01-08 Sensitive Read / Export

### Steps

1. User requests destination/evidence read/export.
2. IAM-02 permission check.
3. Step-up/approval where required.
4. SEC-01 sensitive read/export event emitted.
5. Data returned with masking/redaction.
6. Export expires.

---

## 10. WF-WLT01-09 Reconciliation

### Scheduled Checks

1. Active destination with suspended/restricted/closed client.
2. Active destination with stale AML decision.
3. Active destination with expired wallet/bank risk result.
4. Active destination before cooling-off ended.
5. Revoked destination used downstream.
6. Destination decision token reused outside scope.
7. High-risk wallet active without Compliance approval.
8. Payout beneficiary mismatch without approval.
9. Travel Rule missing data but destination allowed.
10. Sensitive read/export without SEC-01 audit.

---

## 11. WF-WLT01-10 Execution-Time Verify-And-Consume

### Trigger

MON, settlement, payout, withdrawal, deposit, or Travel Rule module is ready to move money/assets or attribute deposit.

### Steps

1. Receive decision token and execution reference.
2. Re-read current destination state.
3. Re-read current whitelist version and revocation epoch.
4. Re-read current AML decision/hash/revocation epoch.
5. Re-read current client status and mandate version.
6. Re-read risk-result and limits version.
7. Verify amount/currency/asset/action/destination/chain/rail scope.
8. Verify token is unexpired and not consumed for another execution.
9. Atomically mark decision consumed for the same execution reference.
10. Return allow only if all state is unchanged/current.
11. Emit SEC-01 audit event.

### Rules

1. TTL alone is not sufficient.
2. Any state change after issuance fails closed.
3. Consumption must be atomic with execution request or fail closed.

---

## 12. WF-WLT01-11 Limit / Velocity / First-Use Control

### Trigger

Destination use gate or execution-time revalidation.

### Steps

1. Load destination/client limit profile.
2. Check per-transaction amount.
3. Check daily and rolling velocity.
4. Check destination/client/asset/rail concentration.
5. If destination is newly activated, apply first-use limit or step-up.
6. Record limit evaluation result.
7. Return allow/hold/deny.
8. Emit audit event.

---

## 13. WF-WLT01-12 Inbound Deposit Source Screening

### Trigger

Inbound crypto or fiat deposit is detected for attribution.

### Steps

1. Capture originating wallet/bank/source details where available.
2. Attempt to match inbound source to registered/screened client source/destination.
3. Screen source wallet/bank/counterparty using wallet analytics and AML-01 where required.
4. If source is clear and matched, return eligible-for-attribution result.
5. If source is unscreened, unknown, unmatched, sanctioned, or high-risk, quarantine/hold.
6. Route quarantine to Compliance/Operations.
7. Prevent available-balance credit until downstream ledger/deposit module receives clearance.
8. Emit SEC-01 audit event.

---

## 14. WF-WLT01-13 AML Revocation Subscription

### Trigger

AML-01 emits outcome revocation, new hit, list update interim block, or Travel Rule restriction.

### Steps

1. Receive AML revocation/new-hit signal.
2. Identify affected destinations and outstanding decisions.
3. Increment destination revocation epoch.
4. Revoke/restrict destination where required.
5. Invalidate outstanding decision tokens.
6. Notify downstream modules.
7. Emit SEC-01 audit event.

---

## 15. WF-WLT01-14 Cooling-Off New-Risk Cancellation

### Trigger

New AML/wallet/KYC/client/mandate/Travel Rule/vendor hit occurs during cooling-off.

### Steps

1. Mark cooling-off cancelled.
2. Keep destination inactive.
3. Require re-review/re-approval before restart.
4. Notify client where safe and not tipping-off.
5. Emit SEC-01 audit event.
