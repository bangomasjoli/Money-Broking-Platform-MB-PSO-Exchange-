# REC-01 Reconciliation / Finance Reporting
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| Reconciliation run | Financial Critical | Immutable |
| Source snapshot hash | Security / Financial Critical | Audit retained |
| Break record | Financial / Control Critical | Immutable lifecycle |
| Break evidence | Financial / Sensitive | Restricted |
| Break closure | Control Critical | Maker-checker |
| Safeguarding report | Financial Critical | Restricted |
| Value conservation report | Financial Critical | Restricted |
| Audit completeness report | Security Critical | Restricted |
| Finance report | Financial Sensitive | Controlled export |
| Evidence pack | Highly Restricted | Approval and masking |
| Close sign-off | Control Critical | Audit retained |

## 2. Prohibited Data

REC-01 must not store:

1. private keys.
2. provider secrets.
3. mutable ledger source of truth.
4. mutable balance source of truth.
5. raw KYC/AML evidence unless evidence-pack policy permits controlled reference.
6. Exchange order book or matching data.

## 3. Protection Rules

1. Sensitive exports require maker-checker.
2. Evidence packs apply masking/minimisation.
3. Report generation audited.
4. Break evidence retained.
5. Source snapshot hashes immutable.

## v1.1 Data Classification Additions

| Data | Classification | Protection |
|---|---|---|
| Population coverage record | Control Critical | Immutable/audited |
| In-flight reconciling item | Financial Critical | SLA monitored |
| External statement | Financial Critical | Authenticated/restricted |
| REC integrity anchor | Security Critical | Hash-chain/external anchor |
| Policy version | Control Critical | Maker-checker |
| Report restatement | Financial/Audit Critical | Versioned |
| Regulatory obligation | Regulatory Critical | Deadline escalation |

Rules:

1. External statements are restricted and must be hash-retained.
2. Population coverage proof is mandatory evidence for full reports.
3. REC anchors are tamper-evidence records.
4. Policy version changes are control-critical.
5. Regulatory obligation records are retained as compliance evidence.
