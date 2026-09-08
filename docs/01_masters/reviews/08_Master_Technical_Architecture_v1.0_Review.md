# Principal Fintech Platform Architect Review

## Document Reviewed: 08_Master_Technical_Architecture_v1.0.md

| Item | Details |
|---|---|
| Reviewed document | 08_Master_Technical_Architecture_v1.0.md |
| Platform | AIX Money Broking + PSO Platform |
| Review type | Principal Fintech Platform Architect / Regulated Fintech Technical Architecture Review |
| Base documents (as cited) | 00–07 at v1.2 / v1.3 (incl. `07_Master_Data_Flow_v1.2.md`) |
| Review basis | Labuan FSA Money Broking + PSO scope, Exchange application pending |
| Verdict | Strong, comprehensive technical architecture; five gaps (inbound webhook ingress, module-boundary enforcement, audit-write atomicity, scheduler, per-client isolation) to close before the Master Security Architecture (doc 09) |

---

## 0. Summary

This is a strong, comprehensive technical architecture — a justified architecture-style decision (modular monolith + event-driven workers + isolated ledger + append-only audit), runtime zones, an environment matrix, a service catalogue, the data layer, a genuinely good ledger/money section (immutable ledger, derived balance, atomic transaction boundary, **outbox pattern**), the LP agency execution sequence, a vendor adapter pattern with fail behaviour, audit architecture, backup/DR, feature-flag locks, a prohibited-architecture list, and an architecture-to-rule mapping (§26) that correctly uses the v1.2 rule IDs (AML-RULE-006, SOD-RULE-001, FX-RULE-001, LED-RULE-005, REL-RULE-001, GOV-RULE-001).

**Version note:** it cites `07_Master_Data_Flow_v1.2.md` and the other v1.2 bases; the base-version delta review confirmed the `00→07` v1.2 chain is clean, so the foundation is sound.

This review focuses on genuine architecture gaps — missing infrastructure patterns rather than drift from the regulated design.

---

## 1. Critical Gaps

### C1. No inbound webhook / callback ingress architecture (Areas 6, 7) — HIGHEST PRIORITY

§14 models **outbound** vendor adapter calls thoroughly, but the platform fundamentally depends on **inbound** events: custodian/node **on-chain deposit detection**, bank statement/payment webhooks, LP execution callbacks, and async screening results. There is no architecture for **inbound webhook security** — HMAC/signature verification, replay protection, idempotent processing, source-IP allowlisting, and a controlled ingress path. This is both an attack surface (a spoofed "deposit confirmed" callback could credit a client balance) and a functional necessity for deposits/settlement. It is the biggest architectural hole.

### C2. Internal module-boundary enforcement is unspecified for the modular monolith (Areas 3, 11)

§3 deliberately chooses a modular monolith and leans on "strict boundaries" to justify it — and to enable the later service extraction in §3.2. But there is **no rule that modules must not read each other's database schemas directly.** That single discipline (each module owns its schema; cross-module access goes through the module's service interface, never a raw table read) is what makes a modular monolith actually modular. Without it, Reporting reads ledger tables, Compliance reads client tables, "strict boundaries" become fiction, and §3.2 extraction becomes impossible. This is the load-bearing decision behind the whole architecture style.

### C3. Audit-write atomicity vs the transactional DB is unspecified (Areas 4, 7)

Audit is a hard regulatory control (SEC-RULE-002: append-only, tamper-evident) and the audit store is **separate** from the primary ACID database. But the doc never states whether an audit event is written **in the same transaction** as the business action or **asynchronously**. If async, there is a window where a sensitive/financial action commits with **no audit record** — a direct compliance gap. The §10.4 outbox covers money events but audit is not in that list. The architecture must define an audit-atomicity model (same-transaction, or guaranteed via the outbox with reconciliation of missing audit records).

### C4. No scheduler / time-triggered job architecture (Areas 1, 4)

Several core, regulatorily-mandated flows are **time-triggered**, not event-triggered: **daily client-money safeguarding computation** (SAFE), daily reconciliation, **periodic KYC refresh** (WF-28), sanctions re-screening, backup schedule, and quote/hold **expiry sweeps**. §9.5 covers the async **job queue** (event-driven) but there is **no scheduler/cron component**. These are architecturally distinct, and obligations like daily safeguarding depend on reliable scheduling **with missed-run detection and alerting** — a missed daily safeguarding run is a regulatory failure that must page someone.

### C5. Per-client data-isolation mechanism is unspecified (Areas 3, 11)

Cross-client isolation is asserted (§7.1.4 "client portal can only access own client records") and tested (data-flow §41.6), but the architecture never states the **enforcement mechanism** — row-level security (RLS) in the database, application-level tenant scoping, or both. For a regulated multi-client platform this is a core control that can't be left to per-module discretion; a single missed `WHERE client_id = ?` leaks one institutional client's holdings to another. The mechanism should be an architectural decision, defence-in-depth ideally (RLS + app scoping).

---

## 2. Recommended Corrections

1. **Add an Inbound Integration / Webhook Ingress section (C1):** dedicated ingress handling for custodian/node/bank/LP/screening callbacks — signature/HMAC verification, source-IP allowlist, replay/nonce protection, idempotent processing keyed to a durable store, and fail-closed on verification failure. Tie deposit crediting to verified inbound events only.

2. **Add a Module-Boundary Enforcement rule to §3/§7 (C2):** each module owns its schema; no cross-module direct table/schema reads; all cross-module access via the module's service interface or published events. State this as the precondition for §3.2 extraction, and add an architecture test for it.

3. **Define audit-write atomicity (C3):** specify audit events are written in the same DB transaction as the action, or — if via outbox — add a guaranteed-delivery + missing-audit reconciliation control so no committed sensitive action can lack an audit record. Add audit to the §10.4 outbox list or state the same-transaction model.

4. **Add a Scheduler / Time-Triggered Jobs component (C4):** a reliable scheduler for daily safeguarding, reconciliation, periodic KYC refresh, re-screening, expiry sweeps, and backups — with **missed-run detection, alerting, and idempotent execution**. Distinguish it from the event-driven job queue in §9.5.

5. **Specify the per-client isolation mechanism (C5):** commit to RLS and/or mandatory application-level tenant scoping as an architectural decision, with a cross-client isolation test as a release gate. Prefer defence-in-depth (both).

6. **Specify the idempotency-key store.** §19.3 requires idempotency but doesn't say where keys live; §9.4 correctly bars cache as source of truth — so state that **financial idempotency keys are persisted durably (DB), not cache**, with a retention policy.

7. **Add a trusted time-source / NTP note.** Quote expiry integrity (SYS-RULE-004, server UTC) depends on synchronized clocks across nodes; state NTP sync and that expiry is evaluated against a single authoritative server clock.

8. **Add a read-replica / reporting-isolation note.** Reporting and analytics queries should not contend with ledger writes on the primary; recommend a read replica for reporting (§25.3), with the caveat that financial truth is still read transactionally where correctness matters.

9. **Add a zero-downtime deployment note.** For a live money platform, §23 should state a blue-green/rolling strategy and how in-flight trades/holds/settlements are handled across a deploy (not just "rollback plan").

10. **List Transaction Monitoring and the Scheduler explicitly in §8.** Transaction Monitoring (CMP-21) is currently folded under Compliance Engine; given it's a rules-engine + scheduler consumer, surface it (and the scheduler) as first-class entries.

---

## 3. Additional Architecture Requirements / Parameters to Add

```txt
# --- New architecture components / sections ---
Inbound Webhook / Callback Ingress (HMAC, replay protection, idempotent, IP allowlist, fail-closed)
Scheduler / Time-Triggered Jobs (safeguarding, reconciliation, refresh, expiry sweeps, backups; missed-run alerting)
Module-Boundary Enforcement (no cross-module schema access; service-interface/events only)
Per-Client Data Isolation (RLS + application tenant scoping)
Audit-Write Atomicity model (same-transaction or guaranteed outbox + reconciliation)

# --- Parameters ---
inbound_webhook_security = hmac_replay_protected_idempotent_ip_allowlist
deposit_credit_requires_verified_inbound_event = true
module_cross_schema_direct_access = prohibited
module_access_via_service_interface_or_events = required
audit_write_atomicity = same_transaction_or_guaranteed_outbox_reconciled
scheduler_component = required
scheduler_missed_run_detection = required
per_client_isolation = rls_and_app_scoping
idempotency_key_store = durable_database
financial_idempotency_key_in_cache = prohibited
trusted_time_source = ntp_synced_server_authoritative
reporting_read_replica = recommended
zero_downtime_deployment = required_with_inflight_txn_handling
```

---

## 4. Top Priorities Before the Master Security Architecture (doc 09)

1. **C1** — Inbound webhook security. A spoofable deposit-credit path and a real attack surface.
2. **C3** — Audit-write atomicity. Committed actions must never lack an audit record.
3. **C2** — Module-boundary enforcement. The discipline the entire modular-monolith choice rests on.

C4 (scheduler) and C5 (client isolation) should ride along since both underpin regulatory obligations (daily safeguarding, cross-client isolation). Several detail items (encryption/secrets/network) legitimately defer to doc 09, but C1–C5 are technical-architecture decisions that shouldn't be pushed downstream.

---

## 5. Consistency Note

The exchange-lock / agency / ledger-integrity architecture is genuinely tight — §22 future-locked exclusion, §29 prohibited architecture, §21 locked feature flags, and §11 LP agency rules are all well-constructed — and §26's architecture-to-rule mapping aligns with the v1.2 rule set confirmed in the base-version delta review. The gaps here are **missing infrastructure patterns** (inbound events, scheduling, module isolation, audit atomicity, tenant isolation), not drift from the regulated design.
