# FND-01 Platform Foundation  
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this FND-01 Platform Foundation Blueprint Pack v1.1 as a principal fintech platform architect, regulated fintech security architect, DevOps reviewer, and modular-monolith architecture reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending.
- MVP supports institutional and HNWI/professional clients only.
- Retail onboarding is disabled by default.
- Execution is LP-backed, agency/back-to-back, pre-funded, best-execution checked, and disclosed brokerage fee only.
- AIX spread markup, principal dealing, market making, internal matching, client-to-client matching, public order book, matching engine, and public exchange trading are blocked.
- This module is FND-01 Platform Foundation.
- It creates the technical foundation for all later modules.
- It must not implement business modules, ledger, trading, KYC, AML, or Exchange features.
- It must support backend enforcement, module boundaries, DB-level isolation baseline, request context, async correlation propagation, standard API envelope, health/readiness, server UTC time, scheduler/job queue baseline, audit/outbox/idempotency baseline with transaction-coupling, rate-limit interface, observability, config drift detection, and deployment smoke hooks.

Review for:
1. Missing foundation components.
2. Missing module-boundary controls.
3. Missing request context/correlation requirements.
4. Missing health/readiness/version requirements.
5. Missing audit/outbox/idempotency baseline requirements.
6. Missing error handling or standard API envelope controls.
7. Missing deployment smoke or config drift controls.
8. Missing observability/log-scrubbing controls.
9. Missing scheduler/job queue baseline or missed-run controls.
10. Missing DB-level isolation / RLS / per-module grant controls.
11. Missing audit/outbox transaction-coupling controls.
12. Missing async correlation propagation controls.
13. Missing rate-limit interface baseline.
14. Missing rule/workflow/data-flow traceability mapping.
15. Missing permission or sensitive-read controls.
16. Any foundation feature that could accidentally allow Exchange-like behaviour, principal dealing, audit bypass, direct ledger/balance edit, or cross-module schema access.
17. Any conflict with master documents 00–11.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional foundation requirements or parameters to add.
```

## Claude Sonnet Coding Prompt

Do not use this until Claude Opus accepts the blueprint.

```txt
Implement FND-01 Platform Foundation only.

Do not implement:
- Authentication/MFA/session business logic beyond interface placeholders.
- RBAC business logic beyond guard interface placeholders.
- KYC/KYB.
- AML/STR/Travel Rule.
- Trading/OTC/RFQ/Spot Broking.
- Ledger/balance/settlement.
- Bank/custodian/LP adapters.
- Exchange order book/matching/client-to-client matching.

Implement:
- Application bootstrap.
- Environment config validation.
- Request context/correlation ID.
- Standard API success/error envelopes.
- Health/readiness/version endpoints.
- Module registry.
- Server UTC time service.
- Audit event envelope interface.
- Outbox interface baseline.
- Idempotency interface baseline.
- Observability/log-scrubbing baseline.
- Config drift check baseline.
- Deployment smoke-test endpoint.
- Module-boundary architecture tests.
- Foundation test cases.

Follow the accepted FND-01 blueprint exactly.
```
