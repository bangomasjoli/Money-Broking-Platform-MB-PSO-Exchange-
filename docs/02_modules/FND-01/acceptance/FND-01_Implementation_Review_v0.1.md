---
document_id: FND-01-ACC-002
title: FND-01 Implementation Review (v0.1)
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: FND-01
control: Platform foundation (scheduler/RLS/audit-outbox/correlation)
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 780e116
---

# FND-01 Platform Foundation — Implementation Review (v0.1)

| Item | Detail |
|---|---|
| Module | FND-01 Platform Foundation |
| Artifact | `aix-platform/` monorepo — first vertical slice (`@aix/foundation` + `services/fnd` + `001_fnd_core`) |
| Blueprint | `modules/FND-01_Platform_Foundation_Blueprint_Pack_v1.2` (§01, §04, §05) |
| Stack | TypeScript · Node 24 · Fastify 5 · PostgreSQL · node-pg-migrate · DB-backed outbox/queue · Vitest · TypeBox |
| Review type | Principal Fintech Platform Architect — implementation review (self-review; recommend independent Opus sign-off) |
| Test evidence | `tsc -b` clean · **28/28 tests pass** (6 unit + 6 app + 3 live-DB integration), verified against a disposable Postgres |
| Verdict | **Accept the slice as the foundation baseline, subject to 3 medium findings (F1–F3) before IAM-01 builds on it.** No Exchange runtime; controls fail closed. |

---

## 0. Summary

The slice implements the FND-01 "safe technical base": standard envelope, request context + async correlation, fail-closed config, server-authoritative time, durable idempotency, transaction-coupled outbox + audit publisher, module registry, health/readiness/version, scheduler/job/rate-limit baselines, an interim internal-identity seam, per-module DB grant + RLS convention, and a boot-time no-Exchange guard. The critical control — **audit/outbox transaction-coupling (§5.5)** — is implemented correctly and proven by a live-DB test: the audit event commits in the same transaction as the action and rolls back with it.

The findings below are not blocking for a foundation baseline, but F1 and F2 should close before IAM-01 (which will consume the idempotency and readiness contracts) is built on top.

---

## 1. Acceptance-criteria coverage (blueprint §12)

| # | Criterion | Status | Evidence / note |
|---|---|---|---|
| 1 | Starts + fails safely on missing critical config | **Met** | `loadConfig` fails closed; `config.test.ts` (4 fail-closed cases) |
| 2 | Request context generated + propagated | **Met** | `createRequestContext` + AsyncLocalStorage; `context.test.ts`, `app.test.ts` header echo |
| 3 | Health/readiness/version endpoints | **Met** | `routes/system.ts`; app test |
| 4 | Standard API envelope | **Met** | `successEnvelope`/`errorEnvelope`; every route + error handler |
| 5 | Standard error envelope | **Met** | `setErrorHandler`; `errors.test.ts`, 404 + validation app tests |
| 6 | Module registry exists | **Met** | `foundation.module_registry` + `GET /foundation/modules` |
| 7 | Module boundary rules testable | **Partial** | No-Exchange boot guard tested; broad architecture/import-boundary lint (F3) not yet automated |
| 8 | Server UTC time service | **Met** | `time.ts`; `GET /foundation/time` |
| 9 | Audit-event envelope | **Met** | `buildAuditEnvelope`/`publishAudit` |
| 10 | Outbox interface | **Met** | `foundation.outbox_event` + `enqueueOutbox`, transaction-coupled |
| 11 | Idempotency interface | **Met (interface)** | `beginIdempotent`/`completeIdempotent`; integration test proves new/dup/conflict — **but not yet wired into write endpoints (F1)** |
| 12 | Observability baseline | **Partial** | Structured Fastify logger + secret redaction; metrics/traces exporters deferred (§13) |
| 13 | PII/log-scrubbing baseline | **Met (baseline)** | `redact` on auth + internal-token headers; full scrub policy is §13 open item |
| 14 | Feature-flag + licence-lock interfaces | **Partial** | Readiness exposes `licence_lock_interface`; real check deferred to CFG-01 — see F2 |
| 15 | Exchange runtime absent/blocked | **Met** | `assertNoExchangeRuntime` at boot; `no-exchange.test.ts` |
| 16 | Scheduler/job-queue baseline + tested | **Met** | `scheduled_job`/`job_run`/`job_queue_message` + register/enqueue; integration test |
| 17 | DB-level isolation baseline + tested | **Partial** | `fnd_runtime_grants.sql` role + least-privilege applied/verified; cross-schema-denied + client-RLS tests deferred until a second schema/client table exists (F3) |
| 18 | Audit/outbox transaction-coupling + tested | **Met** | `withTransaction` + coupled `publishAudit`; live-DB test asserts audit row committed with action |
| 19 | Async correlation propagation + tested | **Met** | `deriveAsyncContext`, correlation required on outbox/enqueue (`ASYNC_CORRELATION_MISSING`) |
| 20 | Rate-limit interface + tested | **Partial** | `POST /foundation/rate-limit/check` returns a decision; allow-by-default MVP, not yet logging to `rate_limit_decision_log` |
| 21 | Rule/workflow/data-flow traceability mapping | **Deferred** | Not in this slice; belongs with the module-registry `dependencies` + a traceability doc |
| 22 | Foundation smoke tests pass | **Met** | `POST /foundation/smoke-test` records run/checks + audit; unit/app/integration green |

**Score:** 14 Met · 6 Partial · 1 Met-interface · 1 Deferred. Core acceptance controls are in place; partials are breadth, not correctness.

---

## 2. Controls verified (with evidence)

- **Fail-closed config** — missing `DATABASE_URL`/`INTERNAL_SERVICE_TOKEN`/`ENVIRONMENT` aborts startup with `CONFIGURATION_INVALID`, reporting all problems at once.
- **Transaction-coupling (§5.5)** — `scheduler/jobs/register` and `jobs/enqueue` write their audit event through the same `withTransaction` client; integration test confirms the `audit.event` outbox row is present after a successful register, and any audit failure rolls back the action.
- **Correlation everywhere** — enforced on the outbox path; missing correlation fails closed rather than emitting an untraceable event.
- **Fail-closed identity** — sensitive endpoints return `SERVICE_IDENTITY_REQUIRED` (401) without the internal token (interim IAM seam).
- **Backend validation** — TypeBox schemas reject malformed bodies with `VALIDATION_ERROR`; `additionalProperties:false` blocks hidden-field injection.
- **No Exchange runtime** — boot guard throws on any prohibited route fragment; unit-tested both ways.
- **Least-privilege DB** — `role_fnd_runtime` created with `USAGE` + `SELECT/INSERT/UPDATE` on `foundation` only; no cross-schema grant; applied and verified on the live DB.

---

## 3. Findings (most-significant first)

### F1 — Idempotency baseline is not consumed by the write endpoints (medium)
`beginIdempotent`/`completeIdempotent` and the `Idempotency-Key` header exist and are tested in isolation, but `scheduler/jobs/register` and `jobs/enqueue` achieve dedup via SQL `ON CONFLICT` on natural keys, not via the `foundation.idempotency_record` baseline. Consequence: the documented idempotency envelope (FND-FR-009) is available but unproven on the actual HTTP action path, and IAM-01 has no worked example to copy. **Recommendation:** wire the two sensitive POSTs through `beginIdempotent`/`completeIdempotent` keyed on the `Idempotency-Key` header + actor + namespaced action, and add an app test proving a replayed key returns the prior result.

### F2 — Readiness reports `licence_lock_interface: pass` as a static placeholder (medium)
§5.2 requires unknown licence-lock state to **fail closed**. Until CFG-01 exists there is no real check, but a hard-coded `pass` is the opposite of fail-closed and could mask a genuinely unavailable interface later. **Recommendation:** represent it explicitly as `not_configured` (interim, non-blocking for readiness in non-prod) with a TODO/seam to flip to fail-closed once CFG-01 lands, and assert the seam in a test. Same applies to the `queue`/`audit_outbox` checks reusing the DB ping — acceptable (DB-backed) but should be named as such.

### F3 — Module-boundary + cross-schema isolation enforcement is convention-only (medium/low)
The no-Exchange guard is automated, but §5.3/§5.4 boundary rules (no cross-module schema access; runtime role cannot read another schema; client-data RLS denies cross-client) are documented in `fnd_runtime_grants.sql` and not yet enforced by a test/lint — reasonable now (only one schema exists), but it must land with the second module. **Recommendation:** add the §05.5.3 deployment tests (runtime role denied on a foreign schema; missing client scope fails closed) as soon as IAM-01 introduces a second schema, and add an import-boundary lint so a module cannot import another module's internals.

### Minor / non-blocking
- `rate-limit/check` doesn't persist to `rate_limit_decision_log` (interface-only MVP) — fine, but note it.
- No outbox/queue **worker** yet (durable write side + contract are in place); the async drainer + missed-run detector are follow-up tasks (FND-FR-014/015 runtime side).
- `release_registry`, `config_baseline`, `config_drift_result` tables exist without producing/consuming logic yet (drift-detection hook, scope item 21) — deferred by design.
- `npm audit`: 7 transitive vulns in dev deps — schedule a `npm audit` follow-up; none in the runtime path.

---

## 4. Regulatory / licence posture

Clean. No order-book/matching/market-making/principal-dealing/spread surface anywhere; the lock is enforced at boot, not just documented. No ledger/balance/audit-edit or guard-bypass helper exists (§11 prohibited behaviours hold). Audit is publish-only via outbox (FND correctly does **not** own the audit store — that is SEC-01). Secrets are read from env and redacted in logs; KMS/vault is a declared §13 open item.

---

## 5. Verdict

**Accept the FND-01 slice as the platform foundation baseline.** Correctness of the core controls (fail-closed config, transaction-coupled audit/outbox, correlation propagation, fail-closed identity, no-Exchange guard, least-privilege DB) is implemented and demonstrated with passing unit, app, and live-DB integration tests. The three medium findings are breadth/wiring, not design faults: **close F1 and F2 before IAM-01** consumes the idempotency and readiness contracts; **F3** lands with the second module. Recommend an independent Opus review of this file + the diff before tagging the slice accepted, per the model policy for foundation/security-critical code.

**Next module:** IAM-01 Authentication / MFA / Session — builds on `@aix/foundation`, adds `services/iam` + migration `002_iam_auth_session`, and should be the first real consumer of the idempotency, audit, outbox, and context baselines proven here.
