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

## v1.1 Additional Risk Controls

| Risk ID | Risk | Control | Tests |
|---|---|---|---|
| REC1-RISK-011 | All-green sampled but incomplete population | SEC/E2E denominator coverage | REC1-TC-039-043 |
| REC1-RISK-012 | False/missed breaks from asynchronous cut-off | Shared as-of sequence / in-flight class | REC1-TC-044-048 |
| REC1-RISK-013 | Forged/stale/partial external statement | External statement trust model | REC1-TC-049-053 |
| REC1-RISK-014 | REC evidence tampered | REC hash-chain/external anchor | REC1-TC-054-056 |
| REC1-RISK-015 | Selective scoping | Mandated scope enforcement | REC1-TC-043, REC1-TC-080 |
| REC1-RISK-016 | Recon not independent | SoD/four-eyes | REC1-TC-057-058 |
| REC1-RISK-017 | Break closed without true remediation | Clean re-reconciliation closure | REC1-TC-059-063 |
| REC1-RISK-018 | Tolerances mask critical issue | Governed tolerances / zero-tolerance | REC1-TC-064 |
| REC1-RISK-019 | Assurance logic weakened silently | Rule/severity governance | REC1-TC-065-067 |
| REC1-RISK-020 | Final report silently edited | Report restatement | REC1-TC-068-069 |
| REC1-RISK-021 | Regulatory filing missed | Obligation tracker | REC1-TC-070-072 |
