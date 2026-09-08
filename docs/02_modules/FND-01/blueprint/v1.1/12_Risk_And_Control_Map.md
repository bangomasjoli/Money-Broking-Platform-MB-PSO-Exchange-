# FND-01 Platform Foundation  
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| FND-RISK-001 | Missing critical config at startup | Unsafe runtime | Startup validation and fail closed | FND-TC-002 |
| FND-RISK-002 | Unknown environment | Wrong config/secrets | Environment validation | FND-TC-003 |
| FND-RISK-003 | Request cannot be traced | Poor audit/investigation | Request/correlation ID required | FND-TC-009/010 |
| FND-RISK-004 | Client scope missing | Cross-client data leak | Server-derived tenant scope | FND-TC-012/013 |
| FND-RISK-005 | UI-only enforcement | Control bypass | Backend guard interfaces | Module tests |
| FND-RISK-006 | Module boundary collapse | Unmaintainable/regulatory risk | Schema ownership and boundary tests | FND-TC-030/031/032 |
| FND-RISK-007 | Exchange module activated | Licence breach | Module registry block + smoke check | FND-TC-028/052 |
| FND-RISK-008 | Audit event missing | Compliance failure | Audit publisher/outbox baseline | FND-TC-037/039 |
| FND-RISK-009 | Duplicate action | Financial duplicate risk | Idempotency baseline | FND-TC-042/043 |
| FND-RISK-010 | Outbox message lost | Missing downstream action | Durable outbox and DLQ alert | FND-TC-040/041 |
| FND-RISK-011 | Secret/PII logged | Data breach | Log scrubbing baseline | FND-TC-045/046/047 |
| FND-RISK-012 | Time drift | Quote/hold/audit timing failure | NTP/server UTC time service | FND-TC-033/035 |
| FND-RISK-013 | Config drift | Unsafe production state | Drift detection and alert | FND-TC-008/053 |
| FND-RISK-014 | Artefact mismatch | Untested code deployed | Version/hash endpoint | FND-TC-024/025 |
| FND-RISK-015 | Smoke test bypass | Unsafe deployment | Smoke endpoint permission and evidence | FND-TC-050/055 |
| FND-RISK-016 | Direct ledger/balance utility appears | Financial integrity risk | Prohibited behaviour list and architecture test | FND-TC-031 |
| FND-RISK-017 | Feature flag unknown | Unsafe enabled/disabled state | Fail closed interface | FND-TC-007 |
| FND-RISK-018 | Licence lock unknown | Licence breach risk | Fail closed interface | FND-TC-006 |
| FND-RISK-019 | Scheduled safeguarding/reconciliation job missed | Client-money/compliance failure | Scheduler missed-run detection | FND-TC-063 |
| FND-RISK-020 | Job duplicate or lost async work | Financial/compliance inconsistency | Durable job queue, idempotency, dead-letter | FND-TC-067/068 |
| FND-RISK-021 | Runtime cross-schema access | Module boundary breach | Per-module DB grants | FND-TC-072/073 |
| FND-RISK-022 | Cross-client data leakage | Privacy/security breach | RLS/app scoping baseline | FND-TC-074/075 |
| FND-RISK-023 | Sensitive action commits without audit | Compliance failure | Transaction-coupled audit/outbox | FND-TC-077/078 |
| FND-RISK-024 | Async trace lost | Investigation failure | Async correlation propagation | FND-TC-070 |
| FND-RISK-025 | Abuse not rate limited | Security/fraud exposure | Rate-limit interface | FND-TC-082/083 |
| FND-RISK-026 | Traceability audit cannot prove coverage | Go-live assurance failure | Rule/WF/DF/test mapping | FND-TC-086 |

## Control Priorities

Critical controls:

1. Startup fail-closed.
2. Request context and tenant scope.
3. Module-boundary enforcement.
4. Exchange component block.
5. Audit/outbox/idempotency baseline.
6. Log scrubbing.
7. Deployment smoke tests.
8. Config drift detection.
9. Scheduler/job queue missed-run and dead-letter detection.
10. Per-module DB grants and RLS baseline.
11. Transaction-coupled audit/outbox contract.
12. Async correlation propagation.
13. Rate-limit interface.
14. Traceability mapping.
