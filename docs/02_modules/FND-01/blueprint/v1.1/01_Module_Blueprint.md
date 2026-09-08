# FND-01 Platform Foundation  
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | FND-01 |
| Module name | Platform Foundation |
| Pack version | v1.1 |
| Status | Revised after Claude Opus review; scheduler/job queue baseline, DB-level isolation, audit/outbox transaction-coupling, async correlation, rate-limit interface, idempotency scope, role mapping, and traceability controls added |
| Platform | AIX Money Broking Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | Foundation |
| Depends on | Master SDLC foundation pack 00–11 |
| Blocks | All regulated business modules until accepted |

Base documents:
- 00_Licence_Scope_And_Feature_Lock_v1.3.md
- 01_Project_Charter_v1.3.md
- 02_Software_Requirement_Specification_v1.2.md
- 03_Master_Module_Index_v1.2.md
- 04_Role_And_Permission_Matrix_v1.2.md
- 05_Master_Workflow_Map_v1.2.md
- 06_Master_System_Rules_v1.2.md
- 07_Master_Data_Flow_v1.2.md
- 08_Master_Technical_Architecture_v1.2.md
- 09_Master_Security_Architecture_v1.2.md
- 10_Master_Testing_Strategy_v1.2.md
- 11_Master_Deployment_Strategy_v1.2.md


---

## 2. Module Purpose

The Platform Foundation module creates the safe technical base for all other AIX platform modules.

It defines:

1. Application runtime standards.
2. Environment separation.
3. Request context and correlation standards.
4. Module boundary enforcement.
5. Backend-only enforcement pattern.
6. Configuration baseline.
7. Health and readiness checks.
8. Service identity baseline.
9. Observability baseline.
10. Error response baseline.
11. Audit event envelope baseline.
12. Idempotency envelope baseline.
13. Feature-flag and licence-lock integration points.
14. Secure file, queue, and background job baseline.
15. Deployment and smoke-test baseline.

---

## 3. In Scope

FND-01 covers:

1. Application bootstrap.
2. Environment configuration.
3. API gateway integration conventions.
4. Request validation envelope.
5. Correlation ID and request ID propagation.
6. Standard API response format.
7. Standard error format.
8. Health, readiness, and liveness endpoints.
9. Runtime version endpoint.
10. Module registry.
11. Module boundary policy.
12. Feature flag read-only check interface.
13. Licence lock read-only check interface.
14. Clock/time service abstraction.
15. Idempotency-key interface baseline.
16. Audit-event publisher interface baseline.
17. Outbox interface baseline.
18. Scheduler registration interface baseline.
19. Background job queue interface baseline.
20. Observability and log-scrubbing baseline.
21. Configuration drift detection hook.
22. Deployment smoke-test baseline.

---

## 4. Out of Scope

FND-01 does not implement:

1. Authentication/MFA/session logic.
2. RBAC/permission logic.
3. Full audit log storage or hash-chain.
4. Feature flag administration.
5. Licence-lock administration.
6. KYC/KYB.
7. AML/STR/Travel Rule.
8. Wallet screening.
9. Client onboarding.
10. Trading, OTC, RFQ, or Spot Broking.
11. Ledger, balance, hold, or settlement.
12. Bank, custodian, LP, or vendor adapters.
13. Client-money safeguarding.
14. Reconciliation.
15. Reporting and regulatory filing.
16. Public exchange order book or matching engine.

Those are separate modules.

---

## 5. Critical Principles

### 5.1 Backend Is Source of Truth

No frontend or portal may enforce a critical rule alone.

FND-01 must provide backend patterns for:

1. Request validation.
2. Permission guard handoff.
3. Feature flag check.
4. Licence lock check.
5. Workflow state guard handoff.
6. Audit event emission.
7. Error code response.
8. Idempotency handling.

### 5.2 Default Deny / Fail Closed

Unknown or unavailable critical dependency must fail closed.

Examples:

1. Unknown feature flag state.
2. Unknown licence lock state.
3. Missing request context.
4. Missing tenant/client scope where required.
5. Missing correlation ID.
6. Missing service identity.
7. Missing idempotency key where required.
8. Audit/outbox persistence unavailable for critical action.

### 5.3 Modular Monolith Boundary

Each module owns its own logical schema and service interface.

Rules:

1. Cross-module direct schema access is prohibited.
2. Cross-module access must use service interface or published events.
3. Ledger, compliance, audit, and security schemas are restricted.
4. Reporting must use approved read models or views.
5. Module ownership must be declared in module registry.


### 5.4 Database-Level Isolation Baseline

FND-01 sets the database access convention for all modules.

Rules:

1. Each runtime module must use a module-scoped database role or equivalent least-privilege database identity.
2. A module runtime role may access only its owned schema and approved shared foundation interfaces.
3. Direct runtime grants to another module's schema are prohibited unless explicitly approved through a controlled service/read-model pattern.
4. Client-owned tables must implement client/tenant ownership keys.
5. Client-owned tables must use database row-level security or equivalent database-level isolation where feasible.
6. Application-level scoping and database-level scoping must both be present for client data.
7. Database grant checks must be part of deployment smoke and release testing.

Parameters:

```txt
per_module_db_grants = required
rls_baseline_for_client_data = required
cross_schema_runtime_grants = prohibited_by_default
```

### 5.5 Audit / Outbox Transaction-Coupling Contract

FND-01 defines the inherited atomicity contract.

Rules:

1. Sensitive actions must not commit unless the audit record or audit outbox record is committed in the same database transaction.
2. Money-critical actions must not commit unless the money-event outbox record is committed in the same database transaction.
3. If audit/outbox persistence is unavailable, sensitive or financial action must fail closed.
4. Guaranteed outbox worker and reconciliation may be async only after the raw event is durably committed.
5. Missing audit/outbox reconciliation is required for downstream modules.

Parameters:

```txt
audit_outbox_transaction_coupling = required
sensitive_action_fails_closed_without_audit = required
money_action_fails_closed_without_outbox = required
```

### 5.6 Async Correlation Propagation

FND-01 must preserve traceability across asynchronous work.

Rules:

1. Scheduler runs must generate a correlation ID or inherit one from the triggering request where applicable.
2. Background jobs must carry origin_correlation_id and causation_id.
3. Outbox events must include correlation_id, causation_id, and source event reference.
4. Workers must stamp correlation IDs into logs, audit events, and retry/dead-letter events.
5. Async traces must allow request → job → outbox → audit reconstruction.

Parameter:

```txt
async_correlation_propagation = required
```

### 5.7 No Exchange Runtime

FND-01 must not create any foundation shortcut that allows:

```txt
public_order_book
matching_engine
client_to_client_matching
market_maker
principal_dealing
public_exchange_api
maker_taker_fee_engine
```

---

## 6. Users / Actors

| Actor | Purpose in FND-01 |
|---|---|
| System Service | Runtime services and workers |
| DevOps / Tech Admin | Deployment and environment operation |
| Security Admin | Security baseline and monitoring |
| Auditor | Read-only evidence review |
| Admin | Non-sensitive module registry/config view |
| Development Team | Build against approved foundation interfaces |
| QA | Execute foundation smoke/regression tests |

---

## 7. Dependencies

### 7.1 Upstream Dependencies

1. Master Technical Architecture.
2. Master Security Architecture.
3. Master Testing Strategy.
4. Master Deployment Strategy.

### 7.2 Downstream Modules Depending on FND-01

All modules depend on FND-01.

Priority downstream modules:

1. IAM-01 Authentication / MFA / Session.
2. IAM-02 RBAC / Permission Guard / SoD.
3. SEC-01 Audit Log / Security Monitoring.
4. CFG-01 Feature Flag / Licence Lock.
5. CLT-01 Client Onboarding.
6. CMP modules.
7. MON / Ledger modules.

---

## 8. Foundation Components

| Component | Description |
|---|---|
| App Runtime | Backend application bootstrap and lifecycle |
| Config Loader | Environment-specific configuration loading |
| Request Context | Request ID, correlation ID, actor context, tenant/client scope |
| Standard API Envelope | Common success/error response pattern |
| Health Service | Health, liveness, readiness, version |
| Module Registry | Declares installed modules and ownership |
| Time Service | Server-authoritative UTC |
| Feature Flag Interface | Read-only check interface to future CFG module |
| Licence Lock Interface | Read-only check interface to future CFG module |
| Audit Publisher | Standard audit-event envelope handoff |
| Outbox Interface | Durable outbox baseline |
| Idempotency Interface | Durable idempotency baseline |
| Job Queue Interface | Background job handoff |
| Scheduler Interface | Scheduled job registration, run tracking, missed-run detection, idempotent execution |
| Job Queue Interface | Background job enqueue, retry, dead-letter, safe restart, async correlation |
| Rate Limit Interface | Standard rate-limit contract and gateway/service handoff |
| DB Isolation Baseline | Per-module DB grants and client-data RLS convention |
| Observability | Logs, metrics, traces, alert hooks |
| Error Mapper | Standard internal/external error codes |
| Deployment Probe | Pre/post deployment smoke hooks |

---

## 9. Functional Requirements

### FND-FR-001 Application Bootstrap

The platform shall start with environment-specific configuration and fail startup if required critical configuration is missing.

### FND-FR-002 Request Context

The platform shall create and propagate a request context containing:

1. request_id.
2. correlation_id.
3. actor_id where authenticated.
4. actor_type.
5. role context where available.
6. client_id/tenant scope where applicable.
7. source IP/device metadata where applicable.
8. server UTC timestamp.

### FND-FR-003 Standard API Envelope

The platform shall return standard API success/error response formats.

### FND-FR-004 Health and Readiness

The platform shall expose health, liveness, readiness, and version endpoints.

### FND-FR-005 Module Registry

The platform shall record module code, module status, owner, version, dependencies, and runtime activation state.

### FND-FR-006 Module Boundary

The platform shall enforce module ownership rules through code structure, repository conventions, schema ownership, and architecture tests.

### FND-FR-007 Time Service

The platform shall use server-authoritative UTC for all regulated timing decisions.

### FND-FR-008 Audit Envelope

The platform shall define a common audit-event envelope for all modules.

### FND-FR-009 Idempotency Envelope

The platform shall define a common idempotency-key envelope for all financial and sensitive actions.

### FND-FR-010 Outbox Baseline

The platform shall define a durable outbox pattern for audit and money-critical event publication.

### FND-FR-011 Observability Baseline

The platform shall create structured logs, metrics, traces, and alerts without leaking sensitive data.

### FND-FR-012 Deployment Smoke Hooks

The platform shall support pre- and post-deployment smoke checks.

### FND-FR-013 Scheduler Registration

The platform shall provide a scheduler registration baseline for modules to register recurring or timed jobs.

### FND-FR-014 Scheduler Missed-Run Detection

The platform shall detect missed scheduled jobs and emit alerts for Critical/High jobs.

### FND-FR-015 Background Job Queue Baseline

The platform shall provide a background job baseline for enqueueing, retrying, dead-lettering, and safely restarting asynchronous jobs.

### FND-FR-016 Database Isolation Baseline

The platform shall define per-module database role/grant conventions and client-data RLS baseline.

### FND-FR-017 Rate-Limit Interface

The platform shall define a rate-limit decision interface or gateway handoff pattern.

### FND-FR-018 Async Correlation

The platform shall propagate correlation IDs, causation IDs, and source references across scheduler, job queue, outbox, and worker processing.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Availability | To be defined in deployment architecture |
| Request tracing | 100% for backend API requests |
| Correlation ID propagation | Required across services/jobs |
| Time source | Server-authoritative UTC, NTP synced |
| Startup safety | Fail if critical config missing |
| Log safety | No secrets, OTP, tokens, STR, or full PII |
| Module boundary tests | Required before merge |
| Health/readiness | Required for deployment |
| Idempotency | Durable for financial/sensitive actions |
| Audit envelope | Required for sensitive events |
| Environment separation | Required |
| Scheduler missed-run detection | Required |
| Job retry/dead-letter handling | Required |
| Per-module DB grants | Required |
| Client-data RLS baseline | Required where feasible |
| Rate-limit interface | Required |
| Async correlation propagation | Required |

---

## 11. Prohibited Behaviours

FND-01 must not provide:

1. Direct database editing UI.
2. Direct balance editing utility.
3. Direct ledger editing utility.
4. Audit deletion or modification utility.
5. Production secret viewer.
6. Public exchange runtime service.
7. Matching engine runtime service.
8. Internal order book runtime service.
9. Bypass permission guard helper.
10. Bypass feature flag helper.
11. Bypass licence lock helper.
12. Bypass audit helper.
13. Cross-module unrestricted DB helper.
14. Production data export helper without approval pattern.

---

## 12. Acceptance Criteria

FND-01 is accepted only if:

1. Application starts and fails safely on missing critical config.
2. Request context is generated and propagated.
3. Health/readiness/version endpoints work.
4. Standard API envelope is implemented.
5. Standard error envelope is implemented.
6. Module registry exists.
7. Module boundary rules are testable.
8. Server UTC time service exists.
9. Audit-event envelope exists.
10. Outbox interface exists.
11. Idempotency interface exists.
12. Observability baseline exists.
13. PII/log scrubbing baseline exists.
14. Feature flag and licence-lock interfaces exist.
15. Exchange runtime components are absent/blocked.
16. Scheduler/job queue baseline exists and is tested.
17. Database-level isolation baseline exists and is tested.
18. Audit/outbox transaction-coupling contract exists and is tested.
19. Async correlation propagation exists and is tested.
20. Rate-limit interface exists and is tested.
21. Rule/workflow/data-flow traceability mapping exists.
22. Foundation smoke tests pass.

---

## 13. Open Items

1. Final backend framework.
2. Final repository structure.
3. Final module packaging convention.
4. Final observability tooling.
5. Final KMS/vault provider.
6. Final CI/CD tool.
7. Exact API response schema.
8. Exact audit event payload schema.
9. Exact idempotency record schema.
10. Exact outbox table/event schema.
11. Exact module registry schema.
12. Exact health/readiness dependency list.
13. Exact scheduler technology.
14. Exact queue technology.
15. Exact per-module DB role naming convention.
16. Exact RLS implementation approach.
17. Exact rate-limiting owner: gateway, service, or both.
18. Exact async trace format.
