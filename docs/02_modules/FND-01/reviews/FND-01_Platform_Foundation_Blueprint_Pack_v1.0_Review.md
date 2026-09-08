# Principal Fintech Platform Architect Review

## Document Reviewed: FND-01_Platform_Foundation_Blueprint_Pack_v1.0

| Item | Details |
|---|---|
| Reviewed pack | FND-01 Platform Foundation Blueprint Pack v1.0 (16 blueprint files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Review type | Principal Fintech Platform Architect / Regulated Fintech Module Blueprint Review |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02 v1.2, 03 v1.2, 04 v1.2, 05 v1.2, 06 v1.2, 07 v1.2, 08 v1.2, 09 v1.2, 10 v1.2, 11 v1.2 |
| Review basis | Labuan FSA Money Broking + PSO scope, Exchange application pending |
| Verdict | Strong, well-structured foundation pack; five gaps (scheduler/job-queue baseline, DB-level isolation, audit/outbox transaction-coupling, async correlation propagation, rule-ID traceability) to close before acceptance |

---

## 0. Summary

This is a strong, well-structured foundation pack and a good first module blueprint. It faithfully operationalizes the doc-08/09/10/11 controls into a buildable base: module-boundary enforcement (01 §5.3), idempotency + outbox baselines (05 §3.7–3.8), a standard audit envelope (08), server-authoritative UTC time service (04 §3.5, FR-007), config-drift detection (02 §7, 05 §3.4), deployment smoke hooks with artifact-hash verification (02 §6, 05 §3.2), exchange-component detection (multiple), log scrubbing (16, FND-TC-045–047), and fail-closed startup (02 §2, 09 §4.1). The out-of-scope boundary (01 §4) is well-drawn and correctly keeps business logic in later modules. Base documents cite 08–11 at v1.2 (all exist), so there is no version-drift.

This review focuses on genuine foundation gaps — missing baselines and traceability, not contradictions of the regulated design.

---

## 1. Critical Gaps

### C1. Scheduler and background-job-queue baselines are in scope but undesigned (Areas 1, 11) — HIGHEST PRIORITY

`01 §3.18–19` and `§8` (Components) both declare a **Scheduler registration interface** and **Job Queue interface** as in-scope foundation deliverables — but there is **no schema (05), no API (04), no workflow (02), no state machine (06), and no test (10)** for either. Only the outbox is actually designed. Doc 08 §9.6 made the scheduler a first-class component with **missed-run detection** (the hard requirement behind daily safeguarding and reconciliation), and downstream MON/CMP modules are told to depend on FND-01 for it (01 §7.2). As written, those modules would inherit a baseline that does not exist. Either design the scheduler + job-queue baselines here (table, interface, missed-run detection, idempotent execution, tests) or explicitly move them out of scope to a named module — but do not claim them and omit them.

### C2. No database-level tenant isolation (RLS) baseline or per-module DB-grant enforcement (Areas 3, 11)

FND-01 handles tenant/client scope at the **application layer** (FR-002, FND-TC-012/013) and enforces module boundaries via **CI architecture tests** (FR-006) — but docs 08 (C2/C5) and 09 (§8) require **defence-in-depth**: per-client **RLS + app scoping**, and module schema ownership enforced at the **database**. There is no foundation pattern for **per-module DB roles/grants** (so a module physically cannot read another's schema at runtime) and no **RLS baseline** for client-owned tables. Foundation is precisely where the DB-access convention should be set; relying on CI tests + app scoping alone means a single missed `WHERE client_id` or one compromised module crosses schema/client boundaries at runtime.

### C3. Audit/outbox baseline does not mandate transaction-coupling or fail-closed-on-unavailable, and is not tested (Areas 7, 9)

Doc 09 §15.2 / doc 08 §10.4 require that a sensitive or financial action **cannot commit without its audit/outbox record written in the same transaction** (or a guaranteed, reconciled outbox). FND-01's outbox table (05 §3.8) only says *"money modules must use transaction-coupled outbox"* — it never defines transaction-coupling as **the** foundation pattern, and there is **no foundation test** for "sensitive action blocked when audit/outbox unavailable." Readiness fails closed (09 §4.2) but that is a startup/health check, not the per-action atomicity guarantee. Since every module inherits this baseline, the atomicity contract — and a test proving fail-closed — belongs here.

### C4. Async correlation-ID propagation is unspecified despite being a stated NFR (Areas 1, 11)

The NFR table (01 §10) requires *"Correlation ID propagation — required across services/jobs,"* but the request-context design (FR-002, WF-FND-02) only covers **inbound API requests**. Background jobs, scheduler runs, and **outbox workers have no inbound request** — the pack never states how the originating `correlation_id` is carried into async processing and stamped onto the audit/outbox events they emit. This breaks end-to-end traceability for exactly the async money/compliance flows (settlement, reconciliation, safeguarding, screening) where post-incident tracing matters most.

### C5. No rule-ID / workflow / data-flow traceability mapping — regulatory mapping is prose only (Area 11)

Doc 10 §29.1 mandates that **every rule, workflow, data flow, and security control maps to ≥1 test**, and the whole `00–11` chain is built on rule-ID traceability. FND-01's `15_Regulatory_Mapping` maps to *needs* in prose ("Licence boundary enforcement", "Auditability") but **not to specific rule IDs** (LIC-RULE, SEC-RULE-002/003, CFG-RULE, DATA-RULE, GOV-RULE-001, REL-RULE-001…), nor to WF-FND workflows or DF items. So the pack's 60 test cases cannot feed the mandated traceability coverage audit. Establishing this table now sets the template every downstream module pack will reuse.

---

## 2. Recommended Corrections

1. **Design the scheduler + job-queue baselines (C1):** add `foundation.scheduled_job` / `foundation.job_run` tables (or explicit out-of-scope deferral), a registration interface, missed-run detection + alerting, idempotent execution, and FND-TC cases — mirroring doc 08 §9.6.

2. **Add a DB-level isolation baseline (C2):** specify per-module database roles/grants (module can only touch its own schema at runtime) and an RLS baseline (or app-scoping helper) for client-owned tables, with tests that a cross-schema/cross-client runtime access is denied — not only caught in CI.

3. **Make transaction-coupling the audit/outbox contract (C3):** state that audit/outbox records are written in the same DB transaction as the business action (or guaranteed-outbox + reconciliation), and add a foundation test that a sensitive action fails closed when audit/outbox cannot be written.

4. **Specify async correlation propagation (C4):** require jobs, scheduler runs, and outbox workers to carry the originating `correlation_id` (and `request_id` where relevant) into their audit/outbox events; add a test asserting correlation continuity across an async hop.

5. **Add a traceability table to `15` (C5):** map each FND control and FND-TC test to specific master rule IDs, WF-FND workflows, and relevant DF items — the reusable module-blueprint traceability template.

6. **Define a rate-limiting baseline.** WF-FND-02 returns `RATE_LIMITED` and doc 09 §9.3 requires rate limiting, but no foundation component/interface/test exists — add at least the interface + a test (even if the gateway owns enforcement).

7. **Clarify idempotency-key uniqueness scope.** `05 §3.7` uniqueness on `(actor_id, action, idempotency_key)` should state the intended scope (per-endpoint namespace) and how a replay from a *different* actor/action is handled, so the "same key, different fingerprint → reject" guarantee is unambiguous.

8. **Reconcile role names with doc 04.** FND-01 uses `TECH_ADMIN`, `SECURITY_ADMIN`, `SYSTEM_JOB`, `INTEGRATION_SERVICE`, etc. (07), while 04 §04 shows owner "Technology" — confirm these map exactly to the Role & Permission Matrix canonical role set to keep RBAC traceability intact.

---

## 3. Consistency Note

- **Version chain clean:** base docs cite 08–11 at v1.2 (all exist); FND-TC-001…060 is a fresh namespace with no collision against the master test suites.
- **Exchange-lock is genuinely strong** — module-registry block, smoke detection (FND-TC-028/052), prohibited behaviours (11), prohibited permissions (07 §4), and reconciliation checks (13 §4) all converge; no foundation shortcut opens an exchange/principal path.
- The gaps are **missing foundation baselines and traceability**, not contradictions of the regulated design. The out-of-scope boundary (01 §4) is well-drawn and correctly keeps business logic in later modules.

---

## 4. Additional Foundation Requirements / Parameters to Add

```txt
# --- New/expanded baselines ---
Scheduler baseline (registration, missed-run detection, idempotent execution)   # or explicit out-of-scope
Background job-queue baseline (enqueue, retry, dead-letter, safe restart)
DB-level tenant isolation (per-module grants + RLS baseline)
Audit/outbox transaction-coupling contract + fail-closed test
Async correlation-ID propagation (jobs, scheduler, outbox workers)
Rate-limiting interface baseline
Traceability table (control/test -> rule ID / WF-FND / DF)

# --- Parameters ---
scheduler_baseline = required_or_explicitly_deferred
scheduler_missed_run_detection = required
job_queue_baseline = required
per_module_db_grants = required
rls_baseline_for_client_data = required
audit_outbox_transaction_coupling = required
sensitive_action_fails_closed_without_audit = required
async_correlation_propagation = required
rate_limit_interface = required
module_traceability_to_rule_ids = required
```

---

## 5. Top Priorities Before FND-01 Acceptance

1. **C1** — Scheduler / job-queue baseline. A claimed foundation deliverable that downstream money/compliance modules will block on.
2. **C2** — DB-level tenant isolation. The runtime half of the defence-in-depth that docs 08/09 mandate.
3. **C3** — Audit/outbox transaction-coupling + fail-closed test. The atomicity contract every module inherits.

C4 (async correlation) and C5 (rule-ID traceability) should ride along — C5 especially, because it defines the traceability template all subsequent module packs will follow.
