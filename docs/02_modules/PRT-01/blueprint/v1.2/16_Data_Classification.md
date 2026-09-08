# PRT-01 Client / Staff / Admin Portal Workflows
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| Portal session context | Security Sensitive | Restricted |
| Portal action request | Control Critical | Audit retained |
| Display status cache | Derived / Non-source | Short-lived |
| Message template | Compliance Sensitive | Approval/versioned |
| Export request | Highly Restricted | Maker-checker |
| User preference | Low/Medium | User scoped |

## 2. Prohibited Data

PRT-01 must not store:

1. ledger source of truth.
2. balance source of truth.
3. private keys/secrets.
4. full unmasked KYC/AML files outside evidence policy.
5. raw Travel Rule data unless controlled view requires.
6. Exchange order book/matching data.

## 3. Protection Rules

1. Sensitive display is masked by default.
2. Export requires approval.
3. Portal cache is not source of truth.
4. Sensitive view is audited.
5. Client-safe messages hide restricted reasons.

## v1.1 Data Classification Additions

| Data | Classification | Protection |
|---|---|---|
| Source status version | Control Critical | Source-bound |
| Object entitlement check | Security Critical | Audit retained |
| Invalidation epoch | Control Critical | Fail-closed |
| Export disclosure log | Highly Restricted | Retained |
| Download token | Highly Restricted | Single-use/expiring |
| Upload intake | Security Sensitive | Quarantine/scan |
| Notification outbox | Communication Sensitive | Supersession |
| Client-safe reason code | Compliance Sensitive | Approved |
| Correlation ID | Control Critical | E2E/SEC linked |

Rules:

1. source status version is required for money-critical display.
2. object entitlement decisions are audit retained.
3. export tokens are not reusable.
4. upload data remains quarantined until scan passes.
5. client-safe and internal reason stores are separated.
