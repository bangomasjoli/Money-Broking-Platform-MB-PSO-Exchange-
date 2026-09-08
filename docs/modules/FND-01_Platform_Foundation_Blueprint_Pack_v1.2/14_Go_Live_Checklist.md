# FND-01 Platform Foundation  
## 14 Go-Live Checklist

## 1. Foundation Go-Live Gates

FND-01 can go live only when all Critical items pass.

| # | Gate | Status |
|---:|---|---|
| 1 | Module blueprint approved | Pending |
| 2 | Application bootstrap implemented | Pending |
| 3 | Critical config validation implemented | Pending |
| 4 | Environment separation verified | Pending |
| 5 | Request context implemented | Pending |
| 6 | Correlation ID propagation implemented | Pending |
| 7 | Standard API envelope implemented | Pending |
| 8 | Standard error envelope implemented | Pending |
| 9 | Health endpoint implemented | Pending |
| 10 | Readiness endpoint implemented | Pending |
| 11 | Version/artifact endpoint implemented | Pending |
| 12 | Module registry implemented | Pending |
| 13 | Module boundary tests passed | Pending |
| 14 | Future-locked Exchange components absent/blocked | Pending |
| 15 | Server UTC time service implemented | Pending |
| 16 | NTP/clock drift monitoring configured | Pending |
| 17 | Audit event envelope implemented | Pending |
| 18 | Outbox baseline implemented | Pending |
| 19 | Idempotency baseline implemented | Pending |
| 20 | Observability/logging baseline implemented | Pending |
| 21 | Log scrubbing tested | Pending |
| 22 | Config drift detection implemented | Pending |
| 23 | Deployment smoke hooks implemented | Pending |
| 24 | Smoke test evidence repository linked | Pending |
| 25 | Permission rules tested | Pending |
| 26 | Sensitive read logging tested | Pending |
| 27 | No direct ledger/balance utility exists | Pending |
| 28 | No audit delete/modify utility exists | Pending |
| 29 | Foundation test suite passed | Pending |
| 30 | Security review completed | Pending |
| 31 | Architecture review completed | Pending |
| 32 | DevOps review completed | Pending |
| 33 | Scheduler registration implemented | Pending |
| 34 | Scheduler missed-run detection implemented | Pending |
| 35 | Job queue baseline implemented | Pending |
| 36 | Async correlation propagation tested | Pending |
| 37 | Per-module DB grant baseline implemented | Pending |
| 38 | RLS baseline for client-owned tables defined | Pending |
| 39 | Audit/outbox transaction-coupling contract tested | Pending |
| 40 | Rate-limit interface implemented | Pending |
| 41 | Rule/WF/DF/test traceability mapping completed | Pending |
| 42 | QA sign-off completed | Pending |

---

## 2. Required Evidence

1. Test execution report.
2. Module-boundary test output.
3. Health/readiness/version endpoint evidence.
4. Smoke-test evidence.
5. Config drift test evidence.
6. Log-scrubbing evidence.
7. Audit event sample.
8. Outbox test evidence.
9. Idempotency test evidence.
10. Exchange component absence evidence.
11. Deployment artifact hash evidence.
12. Approval/sign-off record.
13. Scheduler/job queue test evidence.
14. DB grants/RLS baseline evidence.
15. Audit/outbox transaction-coupling evidence.
16. Async correlation propagation evidence.
17. Rate-limit interface evidence.
18. Traceability coverage evidence.

---

## 3. Go-Live Blocking Failures

1. Critical config can be missing without startup failure.
2. Request context missing.
3. Tenant scope missing for scoped endpoints.
4. Cross-module direct schema access permitted.
5. Exchange component active.
6. Audit/outbox baseline unavailable.
7. Logs expose secrets or sensitive data.
8. Version/artifact hash unavailable.
9. Readiness reports ready during critical dependency failure.
10. Foundation smoke test fails.
11. Critical scheduled job missed-run detection absent.
12. Job queue has no retry/dead-letter visibility.
13. Runtime DB role can access another module schema.
14. Client RLS baseline absent where required.
15. Sensitive action can commit without audit/outbox.
16. Async correlation breaks across job/outbox.
17. Rate-limit interface absent.
18. Traceability mapping absent.
