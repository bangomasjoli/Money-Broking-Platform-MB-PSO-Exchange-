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

## v1.1 Data Classification Additions

| Data | Classification | Protection |
|---|---|---|
| Freeze effectiveness proof | Control Critical | Hash-linked/audited |
| Freeze hold | Financial Control Critical | Restricted |
| Auto-freeze trigger | Critical Incident | Restricted |
| Degraded-mode event | Security Critical | Restricted |
| Independent evidence | Highly Restricted | Chain of custody |
| Money recovery verification | Financial Critical | REC/LED linked |
| Freeze consequence | Client Impact / Regulatory | Restricted |
| Communication approval | Regulatory / AML Sensitive | Compliance approval |
| INC integrity anchor | Security Critical | External anchor |

Rules:

1. Degraded-mode and break-glass records are highly restricted.
2. Client-access denial records are regulatory/client-impact evidence.
3. Communications with AML sensitivity are restricted.
4. Freeze effectiveness proof is mandatory closure evidence.
