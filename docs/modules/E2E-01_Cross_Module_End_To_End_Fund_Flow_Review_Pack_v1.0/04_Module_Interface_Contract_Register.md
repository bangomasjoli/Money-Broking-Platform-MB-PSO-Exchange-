# E2E-01 Cross-Module End-to-End Fund-Flow Review
## 04 Module Interface Contract Register

## 1. Contract Register

| Contract ID | Producer | Consumer | Contract |
|---|---|---|---|
| E2E-C-001 | CFG-01 | All modules | Runtime feature/licence decision token |
| E2E-C-002 | IAM-02 | All sensitive modules | Permission / maker-checker / SoD decision |
| E2E-C-003 | SEC-01 | All modules | Audit event ingestion and evidence reference |
| E2E-C-004 | CLT-01 | KYC/AML/WLT/LED/TRD | Client status, class, mandate, authorised users |
| E2E-C-005 | KYC-01 | CLT/AML/WLT | Verification outcome and ownership/beneficiary data |
| E2E-C-006 | AML-01 | CLT/WLT/LED/TRD | AML clear/hit/stale/revoked and pre-transaction gate |
| E2E-C-007 | AML-01 | WLT/LED/TRD | AML revocation/new-hit/list-update signal |
| E2E-C-008 | WLT-01 | LED | Destination verify-and-consume decision |
| E2E-C-009 | WLT-01 | LED | Inbound source clear/quarantine decision |
| E2E-C-010 | LED-01 | TRD | Prefunded hold creation / hold status |
| E2E-C-011 | TRD-01 | LED | Settlement handoff with LP fill/conversion/fee/residual evidence |
| E2E-C-012 | LED-01 | TRD | Actual settlement outcome |
| E2E-C-013 | LED-01 | Reporting/Finance | Safeguarding and reconciliation reports |
| E2E-C-014 | TRD-01 | Reconciliation | Trade/LP/fill evidence |
| E2E-C-015 | WLT-01 | Reconciliation | Destination/source evidence |

## 2. Required Decision Token Fields

All cross-module decision tokens must include:

1. decision ID.
2. producer module.
3. consumer module or action scope.
4. client ID.
5. action type.
6. asset/currency/pair where relevant.
7. amount where relevant.
8. status.
9. version.
10. revocation epoch where relevant.
11. expiry.
12. payload hash.
13. SEC-01 audit ref.
14. idempotency key/source event.

## 3. Fail-Closed Contract Rules

The consumer must fail closed if:

1. token is missing.
2. token is stale.
3. token is revoked.
4. token hash invalid.
5. action scope mismatch.
6. amount/asset/client mismatch.
7. producer unavailable and no approved safe fallback.
8. audit event cannot be emitted for critical action.

## 4. High-Risk Integration Points

| Integration | Highest Risk |
|---|---|
| CLT → KYC/AML | treating handoff as pass |
| AML → WLT/LED/TRD | stale AML outcome |
| WLT → LED | destination token re-use |
| LED → TRD | hold status stale |
| TRD → LED | unconserved fill settlement |
| CFG → TRD | licence-lock TOCTOU |
| SEC → All | missing audit but action proceeds |
