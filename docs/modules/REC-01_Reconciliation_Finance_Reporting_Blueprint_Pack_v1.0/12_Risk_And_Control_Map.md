# REC-01 Reconciliation / Finance Reporting
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| REC1-RISK-001 | REC mutates source data | Source integrity breach | No source mutation | REC1-TC-037 |
| REC1-RISK-002 | Run not reproducible | Audit weakness | Source hashes/run IDs | REC1-TC-001-005 |
| REC1-RISK-003 | Safeguarding deficit missed | Client asset risk | Safeguarding report | REC1-TC-006-010 |
| REC1-RISK-004 | Deposit/payout/trade mismatch missed | Financial loss | Flow reconciliation | REC1-TC-011-018 |
| REC1-RISK-005 | Missing audit evidence | Regulatory weakness | SEC completeness | REC1-TC-019-020 |
| REC1-RISK-006 | Value leakage | Principal exposure | Conservation checks | REC1-TC-024 |
| REC1-RISK-007 | Critical break closed improperly | Control failure | Maker-checker/SoD | REC1-TC-025-030 |
| REC1-RISK-008 | Daily close despite critical issue | Misreporting | Close block gates | REC1-TC-031-032 |
| REC1-RISK-009 | Report hides break | Misleading reporting | Open break warning | REC1-TC-033 |
| REC1-RISK-010 | Sensitive export leak | Data breach | Export controls | REC1-TC-035 |
