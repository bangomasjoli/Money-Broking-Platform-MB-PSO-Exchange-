# aix-platform

Implementation monorepo for the AIX Money Broking + PSO Platform (Labuan FSA regulated).
Blueprints and reviews live separately in `../aix-platform-docs`. Build order and conventions
follow `../aix-platform-docs/implementation/IMP-01_AIX_Master_Implementation_Handover/`.

**Licence lock (non-negotiable):** Money Broking + PSO only. All Exchange runtime is prohibited
(no order book / matching engine / market making / principal dealing / spread markup). Enforced at
the foundation by the boot-time no-Exchange guard (`assertNoExchangeRuntime`).

## Repository model & traceability

**Two sibling repos, kept separate on purpose:**

```
aix-platform/        this repo — implementation code
aix-platform-docs/   sibling   — SDLC masters, module blueprints, reviews, compliance evidence
```

The blueprints/reviews/evidence are controlled, auditor-facing artifacts with their own
change-control and retention, so they stay out of the code repo — this preserves a clean audit
boundary and lets regulators/auditors be granted the docs repo without code access. Code → blueprint
linkage is made explicit and versioned in [`BLUEPRINT_VERSION`](./BLUEPRINT_VERSION): each module
slice records the accepted blueprint version it targets. When a blueprint is re-pinned or a module
is implemented, update that file in the same change.

## Stack

TypeScript · Node.js · Fastify · PostgreSQL · node-pg-migrate · DB-backed outbox/queue ·
Vitest · TypeBox validation.

## Layout

```
packages/foundation   @aix/foundation — shared FND-01 contracts (context, envelope, time,
                      db, idempotency, outbox, audit, no-exchange, config)
services/fnd          FND-01 Platform Foundation service (Fastify)
infra/migrations      node-pg-migrate SQL migrations (001_fnd_core = foundation schema)
infra/grants          per-module DB role / least-privilege / RLS convention SQL
tests                 unit + app (no-DB) + DB-gated integration
```

## Status

**FND-01 Platform Foundation — first vertical slice implemented and tested.**
Later modules (IAM-01 → PRT-01) build on `@aix/foundation` and add their own `services/<code>`
+ migration `002_...` onward.

## Commands

```bash
npm install
npm run typecheck                 # tsc -b (project references)
npm test                          # vitest; DB integration tests self-skip without TEST_DATABASE_URL

# Database (needs a Postgres)
export DATABASE_URL=postgres://user:pass@host:5432/db
npm run migrate:up
psql "$DATABASE_URL" -f infra/grants/fnd_runtime_grants.sql   # privileged step (separate from migration role)

# Run the service (fails closed if critical env missing — see .env.example)
npm run start:fnd
```

## Foundation controls implemented (FND-01 v1.2)

- Standard success/error envelope with `request_id` + `correlation_id` + `server_time_utc` (§04).
- Request context + async correlation propagation via AsyncLocalStorage (FND-FR-002, §5.6).
- Config loader that **fails closed** on missing critical config (FND-FR-001, §5.2).
- Server-authoritative UTC time service (FND-FR-007).
- Durable **idempotency** baseline — namespaced scope, fingerprint-conflict rejection (§3.7).
- Durable **outbox** + **audit publisher**, both **transaction-coupled** to the action (§5.5) — a
  sensitive action rolls back if its audit/outbox write fails (fail closed).
- Module registry, health/readiness/version/time, scheduler register + job enqueue + rate-limit
  interface baselines.
- Interim internal-service-identity guard (IAM handoff seam; IAM-01/IAM-02 own real auth later).
- Per-module DB grant + RLS convention; boot-time no-Exchange guard.

## PR checklist (IMP-01 §03.5)

module code · blueprint files referenced · files changed · tests added · prohibited behaviours
tested · migration notes · deployment notes · rollback notes.
