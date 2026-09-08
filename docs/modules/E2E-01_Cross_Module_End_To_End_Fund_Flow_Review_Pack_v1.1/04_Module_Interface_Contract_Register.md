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
| E2E-C-016 | E2E Saga | All modules | Correlation ID, step plan, expected event manifest |
| E2E-C-017 | All modules | E2E Saga | Step outcome, compensation status, orphan marker |
| E2E-C-018 | KYC-01 | LED-01 | Verified beneficiary / ownership identity for payout remediation |
| E2E-C-019 | IAM-02 | CLT/WLT/TRD | Client-side dual-authorisation outcome |
| E2E-C-020 | CFG-01 | LED-01 | Settlement-time licence lock / kill-switch decision |
| E2E-C-021 | DEP-01 Pending | LED/WLT/AML | Deposit execution / inbound receipt boundary |
| E2E-C-022 | WDR-01 Pending | LED/WLT/AML | Withdrawal/payout execution rail boundary |
| E2E-C-023 | SEC-01 | E2E Saga | Expected-vs-emitted audit completeness |
| E2E-C-024 | LED/TRD | E2E Value Recon | Per-correlation value conservation evidence |

## 2. Required Decision Token Fields

All cross-module decision tokens must include:

1. correlation ID.
2. decision ID.
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
15. idempotency key/source event.
16. point_in_time_snapshot_id.
17. saga_step_id.
18. compensation_ref where applicable.

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

## 5. v1.1 Coherent Decision Bundle Contract

A money-flow action must assemble and validate one coherent decision bundle before execution.

Required fields across all included tokens:

1. `correlation_id`.
2. `client_id`.
3. `action_type`.
4. `amount`.
5. `asset_or_currency`.
6. `trade_id`, `payout_id`, `deposit_id` or `settlement_id`.
7. `point_in_time_snapshot_id`.
8. `token_issued_at_utc`.
9. `token_valid_until_utc`.
10. `revocation_epoch`.
11. `payload_hash`.
12. `sec_audit_ref`.

Bundle fail-closed conditions:

1. missing token.
2. mismatched correlation ID.
3. mismatched client ID.
4. mismatched amount/asset/action.
5. mixed point-in-time snapshot.
6. stale token.
7. revoked token.
8. inconsistent revocation epoch.
9. missing SEC audit ref.

## 6. Point-In-Time Eligibility Snapshot Contract

Before money movement, the platform must create an eligibility snapshot that atomically records:

1. CLT status.
2. KYC outcome/freshness.
3. AML outcome/freshness.
4. CFG licence/feature decision.
5. IAM mandate/dual-authorisation outcome.
6. freeze/restriction status.

The snapshot is bound to the correlation ID and used by downstream decision tokens.
