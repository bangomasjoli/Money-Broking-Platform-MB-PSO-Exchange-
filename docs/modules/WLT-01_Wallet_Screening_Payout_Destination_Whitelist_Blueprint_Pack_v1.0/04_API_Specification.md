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

---

## 5. Vendor Result APIs

### 5.1 POST `/internal/wlt1/vendor-results/wallet`

Receive wallet analytics result.

### 5.2 POST `/internal/wlt1/vendor-results/bank`

Receive bank/payout verification result.

---

## 6. Rescreening APIs

### 6.1 POST `/internal/wlt1/rescreening/run`

Run destination rescreening.

### 6.2 POST `/internal/wlt1/rescreening/trigger`

Trigger destination rescreening.

---

## 7. Evidence APIs

### 7.1 POST `/wlt1/evidence-exports`

Request evidence export.

### 7.2 GET `/wlt1/evidence-exports/{export_id}`

Read evidence export status.

---

## 8. Error Codes

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
