# WLT-01 Wallet Screening / Payout Destination Whitelist
## 03 Diagrams

## 1. Wallet Whitelist Flow

```mermaid
flowchart TD
  A[Wallet Registration] --> B[Canonicalise Address]
  B --> C[Ownership Evidence]
  C --> D[Wallet Screening]
  D --> E{Risk OK?}
  E -->|No| F[Compliance Review / Reject]
  E -->|Yes| G[IAM-02 Approval]
  G --> H[Cooling-Off]
  H --> I[Active Whitelist]
```

---

## 2. Fiat Payout Destination Flow

```mermaid
flowchart TD
  A[Payout Destination Request] --> B[Beneficiary Verification]
  B --> C[AML Screening]
  C --> D{Match / Mismatch?}
  D -->|Mismatch| E[Review / Reject]
  D -->|OK| F[Maker-Checker Approval]
  F --> G[Cooling-Off]
  G --> H[Active Whitelist]
```

---

## 3. Destination Use Gate

```mermaid
flowchart TD
  A[Withdrawal / Payout / Settlement Request] --> B[WLT-01 Destination Gate]
  B --> C{Whitelisted + Active?}
  C -->|No| D[Deny / Hold]
  C -->|Yes| E[AML-01 Pre-Transaction Gate]
  E --> F{AML Clear?}
  F -->|No| D
  F -->|Yes| G[Issue Short-Lived Destination Token]
```

---

## 4. Revocation Propagation

```mermaid
flowchart TD
  A[AML/KYC/CLT/Vendor Trigger] --> B[Revoke Destination]
  B --> C[Invalidate Tokens]
  C --> D[Notify Downstream]
  D --> E[Reconciliation Confirms No Use]
```

---

## 5. Travel Rule Support

```mermaid
flowchart TD
  A[Destination Use Request] --> B{Travel Rule Applies?}
  B -->|No| C[Continue Checks]
  B -->|Yes| D[Validate Originator/Beneficiary/VASP Data]
  D --> E{Complete?}
  E -->|No| F[Hold / Review]
  E -->|Yes| G[AML-01 Travel Rule Screening]
```
