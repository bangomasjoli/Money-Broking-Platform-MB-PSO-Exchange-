# FND-01 Platform Foundation — Implementation First-Step Review (v0.1)

| Item | Detail |
|---|---|
| Module | FND-01 Platform Foundation |
| Phase | Implementation — first module |
| Stage | First step only (search + plan). **No files edited.** |
| Blueprint | `modules/FND-01_Platform_Foundation_Blueprint_Pack_v1.2/` (01, 04, 05 read) |
| Handover refs | `implementation/IMP-01_.../03_Repository_And_Codebase_Setup.md`, `06_Database_Migration_Order.md` |
| Status | Awaiting go-ahead + answers to §6 before any code |

---

## 0. Key finding — greenfield

There is **no existing code** anywhere in the workspace — no `package.json`, `src/`, `services/`, `infra/migrations/`, or any build manifest. FND-01 is the first module to be built, so "existing patterns" come only from:

- **FND-01 v1.2 blueprint** — what to build (`01_Module_Blueprint`, `04_API_Specification`, `05_Database_Design`).
- **IMP-01 handover** — repo layout, migration order (`001_fnd_core` is first), coding standards, shared-library list.

FND-01 §13 leaves stack/framework/repo-packaging/queue/scheduler tech as **Open Items** — decisions to confirm before coding (see §6).

---

## 1. Proposed implementation plan

Build FND-01 as the **foundation service + shared packages** every later module inherits. Scope is the "safe technical base" only — no business logic, no money, no auth logic (those are IAM/LED/etc.).

1. **Repo scaffold** per IMP-01 §03: monorepo (`services/fnd/`, `packages/`, `infra/migrations/`, `tests/`). Root workspace + lint/test tooling only.
2. **`001_fnd_core` migration** — the `foundation` schema + its 12 tables (§3).
3. **Shared packages** (reusable contracts consumed by all future modules): request/correlation context · standard success/error envelope · idempotency · audit-event publisher interface · outbox interface · time service (IMP-01 §2).
4. **FND service** — bootstrap with fail-closed config load (FND-FR-001), request-context middleware (FND-FR-002), foundation endpoints (§4), module registry, scheduler/job-queue/rate-limit interface baselines.
5. **Cross-cutting enforcement baselines**: default-deny/fail-closed (§5.2), audit/outbox transaction-coupling contract (§5.5), async correlation propagation (§5.6), per-module DB grants + client-data RLS convention (§5.4), and the **no-Exchange-runtime** guard (§5.7).
6. **Foundation smoke tests + architecture/boundary tests** (acceptance criteria 22, FR-006).

Delivered as one vertical slice (migration → shared contracts → service endpoints → tests) with focused per-area commits.

## 2. Minimum files to create (greenfield → "create," not "change")

Tight first slice, not the whole monorepo:

- `services/fnd/` — app bootstrap, config loader, request-context middleware, error mapper, health/readiness/version/time/modules handlers, scheduler/enqueue/rate-limit/smoke-test route handlers.
- `packages/error-envelope/`, `packages/request-context/`, `packages/idempotency/`, `packages/audit-client/` (interface + envelope), `packages/outbox/` (interface).
- `infra/migrations/001_fnd_core.*` — the `foundation` schema.
- `tests/unit/…`, `tests/integration/…`, `tests/security/…` for the above.
- Root workspace config (workspace/package manifest, lint, test runner, `.env.example`) — **no secrets**.

Will **not** scaffold the other 16 `services/*` dirs — only `fnd/` + the packages FND-01 owns.

## 3. Database migrations needed

**`001_fnd_core`** (schema `foundation`), tables from FND-01 §05:

`module_registry`, `release_registry`, `config_baseline`, `config_drift_result`, `smoke_test_run`, `smoke_test_check`, `idempotency_record`, `outbox_event`, `scheduled_job`, `job_run`, `job_queue_message`, `rate_limit_decision_log` — plus the 11 named indexes and constraints (e.g. `idempotency_record` unique on `(actor_id, action, idempotency_key)`; critical/high jobs require `missed_run_detection = true`).

Also in scope (FND-01 §5.4 / §05.5): **separate migration role vs runtime role**, per-module `role_fnd_runtime` least-privilege grant, and the **RLS baseline convention** (documented + a demonstrating test; `foundation` has no client-owned tables, so RLS here is the reusable pattern + test harness). Forward-only, checksum-retained, rollback documented (IMP-01 §06.2).

## 4. APIs / services needed

Foundation endpoints only (FND-01 §04) — no business/money/admin-override APIs:

- `GET /foundation/health` · `GET /foundation/readiness` · `GET /foundation/version` · `GET /foundation/time` · `GET /foundation/modules`
- `POST /foundation/smoke-test` · `GET /foundation/scheduler/jobs` · `POST /foundation/scheduler/jobs/register` · `GET /foundation/scheduler/runs` · `POST /foundation/jobs/enqueue` (internal identity only) · `POST /foundation/rate-limit/check` (gateway/internal only)
- **Internal interfaces** (contracts consumed by later modules): Audit Publisher envelope, Idempotency interface, Outbox interface.
- Standard success/error envelope with `request_id` + `correlation_id` + `server_time_utc` on every response; the §5 error-code catalogue.

Sensitive-ish actions here (`smoke-test`, `scheduler/register`, `enqueue`) will carry **correlation ID + emit audit events + backend-validate + fail closed** per the hard rules.

## 5. Tests needed

- **Unit**: config fail-closed on missing critical config (FR-001); request-context generation/propagation (FR-002); envelope + error-mapper; idempotency duplicate-key-different-fingerprint rejection; time-service UTC.
- **Integration**: health/readiness/version/modules/time endpoints; scheduler register rejects unregistered owner + forces missed-run detection on critical; enqueue requires correlation ID (`ASYNC_CORRELATION_MISSING`); audit/outbox **transaction-coupling** (sensitive action rolls back if audit/outbox write fails).
- **Security / architecture**: module-boundary test (no cross-schema access, FR-006); DB isolation (runtime role cannot read/write another schema; missing client scope fails closed, §05.5.3); **no-Exchange-runtime** assertion (§5.7).
- **Prohibited-behaviour tests** (§11): no balance/ledger/audit-edit or guard-bypass helpers exist.
- Foundation **smoke suite** wired to `POST /foundation/smoke-test`.

## 6. Risks / questions before coding

Blocking because FND-01 is the base **every other module inherits** — should not be chosen silently:

1. **Language / framework / runtime — the big one.** IMP-01 §03 implies a **TypeScript/Node monorepo** (`packages/shared-types`, `audit-client`, helm/terraform), but no framework is pinned and FND-01 §13.1 leaves it open. Which stack + web framework (e.g. Node/TS + NestJS or Fastify)? Everything downstream follows this.
2. **Database + migration tool.** Assume **PostgreSQL** (`uuid`, `jsonb`, `timestamptz`, RLS ⇒ Postgres). Confirm, and pick the migration tool (node-pg-migrate / Prisma / Flyway) — sets the `infra/migrations/` convention for all 17 migrations.
3. **Queue + scheduler technology** (§13.13–13.14). DB baseline (`job_queue_message`, `scheduled_job`) is DB-backed; confirm v1 is **DB-outbox/DB-queue only** vs. Redis/broker now.
4. **Repo location.** This workspace is docs-only (`aix-platform-docs`). Code repo **here** (new top-level `aix-platform/`) or a **separate sibling repo**? IMP-01 §03 shows `aix-platform/` as the code root.
5. **Auth on protected foundation endpoints.** IAM-01/02 not built yet. Confirm interim stance: internal-network/service-identity only + documented IAM handoff seam (no auth built here — out of scope §4.1).
6. **Idempotency / outbox scope for v1.** FND-01 owns the interface/baseline; confirm working DB-backed reference implementation now (recommended, so IAM-01 can consume it) vs. interface-only.

**Recommendation for a fast, spec-aligned start:** TypeScript/Node + Fastify + PostgreSQL + DB-backed outbox/queue, code repo in a new `aix-platform/` root, interim internal-identity auth. Items 1–4 are your call.

---

## Hard-rule compliance (carried into coding)

- No Exchange features (§5.7 guard + test) · backend validation always · correlation ID on every sensitive action · audit event on every sensitive action · idempotency on money-impacting actions · focused diffs · module ownership boundary enforced · no ledger/balance/audit-edit path.

**No files created or edited beyond this plan document. Awaiting go-ahead + answers to §6.**
