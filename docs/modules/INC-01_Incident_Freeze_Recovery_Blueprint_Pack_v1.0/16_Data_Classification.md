# INC-01 Incident / Freeze / Recovery
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| Incident record | Security / Operational Critical | Restricted |
| Incident scope | Operational Critical | Audit retained |
| Freeze order | Financial / Operational Critical | Restricted |
| Freeze acknowledgement | Control Critical | Audit retained |
| In-flight item | Financial Critical | Restricted |
| Evidence item | Highly Restricted | Hash-linked |
| Notification obligation | Regulatory Critical | Restricted |
| Recovery plan | Operational Critical | Restricted |
| Resume gate | Control Critical | Maker-checker |
| Post-incident review | Restricted | Management approval |
| Remediation action | Operational Critical | Owner/SLA |

## 2. Prohibited Data

INC-01 must not store:

1. provider private keys/secrets.
2. mutable ledger source of truth.
3. mutable balance source of truth.
4. raw passwords/MFA secrets.
5. full KYC/AML files unless controlled evidence policy permits reference.
6. Exchange order book/matching data.

## 3. Protection Rules

1. Evidence export requires approval.
2. High/critical incident records are restricted.
3. Notification records are restricted.
4. Chain of custody is audit retained.
5. Incident evidence retention follows regulatory/evidence policy.
