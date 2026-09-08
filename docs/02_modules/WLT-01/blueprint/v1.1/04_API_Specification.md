# WLT-01 Wallet Screening / Payout Destination Whitelist
## 04 API Specification

## 1. API Principles

All WLT-01 APIs use FND request/correlation ID, idempotency and standard error envelope.

Sensitive APIs require IAM-02 permission guard.

Sensitive destination/evidence read/export emits SEC-01 audit.

---

## 2. Wallet APIs

### 2.1 POST `/wlt1/wallet-destinations`

Register wallet destination.

### 2.2 GET `/wlt1/wallet-destinations/{destination_id}`

Read wallet destination.

### 2.3 POST `/wlt1/wallet-destinations/{destination_id}/screen`

Run wallet screening.

### 2.4 POST `/wlt1/wallet-destinations/{destination_id}/approve`

Approve wallet whitelist request.

### 2.5 POST `/wlt1/wallet-destinations/{destination_id}/revoke`

Revoke wallet destination.

---

## 3. Payout Destination APIs

### 3.1 POST `/wlt1/payout-destinations`

Register fiat payout destination.

### 3.2 GET `/wlt1/payout-destinations/{destination_id}`

Read payout destination.

### 3.3 POST `/wlt1/payout-destinations/{destination_id}/verify`

Verify payout destination / beneficiary.

### 3.4 POST `/wlt1/payout-destinations/{destination_id}/approve`

Approve payout whitelist request.

### 3.5 POST `/wlt1/payout-destinations/{destination_id}/revoke`

Revoke payout destination.

---

## 4. Destination Use APIs

### 4.1 POST `/internal/wlt1/destinations/{destination_id}/evaluate-use`

Evaluate destination use for downstream module.

### 4.2 POST `/internal/wlt1/destination-decisions/{decision_id}/verify`

Verify destination decision token/reference.

### 4.3 POST `/internal/wlt1/destination-decisions/{decision_id}/verify-and-consume`

Atomically revalidate and consume decision at execution time.

Verify destination decision token/reference.

---

## 5. Limits / Inbound / Revocation APIs

### 5.1 POST `/internal/wlt1/destinations/{destination_id}/limits/evaluate`

Evaluate destination/client value and velocity limits.

### 5.2 POST `/internal/wlt1/inbound-sources/screen`

Screen inbound deposit source and return clear/quarantine/review.

### 5.3 POST `/internal/wlt1/aml-revocations`

Consume AML-01 outcome revocation/new-hit/list-update signal.

---

## 6. Vendor Result APIs

### 8.1 POST `/internal/wlt1/vendor-results/wallet`

Receive wallet analytics result.

### 8.2 POST `/internal/wlt1/vendor-results/bank`

Receive bank/payout verification result.

---

## 7. Rescreening APIs

### 8.1 POST `/internal/wlt1/rescreening/run`

Run destination rescreening.

### 8.2 POST `/internal/wlt1/rescreening/trigger`

Trigger destination rescreening.

---

## 8. Evidence APIs

### 8.1 POST `/wlt1/evidence-exports`

Request evidence export.

### 8.2 GET `/wlt1/evidence-exports/{export_id}`

Read evidence export status.

---

## 9. Error Codes

| Code | Meaning |
|---|---|
| `WLT1_DESTINATION_NOT_FOUND` | Destination not found |
| `WLT1_DESTINATION_NOT_WHITELISTED` | Destination not whitelisted |
| `WLT1_DESTINATION_NOT_ACTIVE` | Destination not active |
| `WLT1_DESTINATION_REVOKED` | Destination revoked |
| `WLT1_COOLING_OFF_ACTIVE` | Cooling-off not complete |
| `WLT1_CLIENT_STATUS_BLOCKED` | Client status blocks use |
| `WLT1_MANDATE_REQUIRED` | Client mandate required |
| `WLT1_CLIENT_DUAL_AUTH_REQUIRED` | Client-side dual auth required |
| `WLT1_WALLET_SCREENING_REQUIRED` | Wallet screening required |
| `WLT1_WALLET_RISK_HIGH` | Wallet high risk |
| `WLT1_WALLET_SANCTIONS_EXPOSURE` | Wallet sanctions exposure |
| `WLT1_WALLET_CHAIN_MISMATCH` | Chain/network mismatch |
| `WLT1_WALLET_ADDRESS_INVALID` | Invalid address |
| `WLT1_BENEFICIARY_MISMATCH` | Beneficiary mismatch |
| `WLT1_THIRD_PARTY_BENEFICIARY_REVIEW` | Third-party beneficiary review |
| `WLT1_AML_GATE_REQUIRED` | AML pre-transaction gate required |
| `WLT1_AML_DECISION_STALE` | AML decision stale/revoked |
| `WLT1_TRAVEL_RULE_DATA_MISSING` | Travel Rule data missing |
| `WLT1_VENDOR_RESULT_INVALID` | Vendor result invalid |
| `WLT1_VENDOR_SOURCE_UNAUTHORISED` | Vendor source unauthorised |
| `WLT1_DECISION_TOKEN_STALE` | Decision token stale |
| `WLT1_DECISION_SCOPE_MISMATCH` | Decision scope mismatch |
| `WLT1_SENSITIVE_READ_LOG_REQUIRED` | Sensitive read logging required |
| `WLT1_EXECUTION_REVALIDATION_REQUIRED` | Execution-time revalidation required |
| `WLT1_REVOCATION_EPOCH_MISMATCH` | Revocation epoch mismatch |
| `WLT1_DECISION_ALREADY_CONSUMED` | Decision already consumed |
| `WLT1_LIMIT_EXCEEDED` | Destination/client limit exceeded |
| `WLT1_VELOCITY_EXCEEDED` | Velocity cap exceeded |
| `WLT1_FIRST_USE_STEPUP_REQUIRED` | First-use lower limit/step-up required |
| `WLT1_INBOUND_SOURCE_SCREENING_REQUIRED` | Inbound source screening required |
| `WLT1_DEPOSIT_QUARANTINED` | Deposit quarantined |
| `WLT1_DEPOSIT_SOURCE_UNMATCHED` | Deposit source/client mismatch |
| `WLT1_UNHOSTED_PROOF_REQUIRED` | Unhosted proof-of-control required |
| `WLT1_PROOF_OF_CONTROL_FAILED` | Proof-of-control failed |
| `WLT1_WALLET_OWN_NAME_REQUIRED` | Wallet first-party/beneficiary binding required |
| `WLT1_ADDRESS_CANONICALISATION_FAILED` | Address canonicalisation failed |
| `WLT1_NAME_SERVICE_ALIAS_NOT_ALLOWED` | Name-service alias cannot be authoritative destination |
| `WLT1_ADDRESS_POISONING_REVIEW` | Address poisoning/lookalike review required |
| `WLT1_UNSUPPORTED_CHAIN` | Unsupported chain/asset/provider coverage |
| `WLT1_AML_REVOCATION_RECEIVED` | AML revocation/new-hit received |
| `WLT1_COOLING_OFF_CANCELLED_BY_RISK` | Cooling-off cancelled due new risk |
