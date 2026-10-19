# aix-platform

Implementation monorepo for the AIX Money Broking + PSO platform. Code lives here in `platform/`; the governance record (masters, blueprints, reviews, acceptance records) lives in this same repository under `../docs/`. Start at `../docs/README.md`. Build order and conventions follow `../docs/03_implementation/IMP-01/`.

**Not production-ready. No regulatory approval is claimed.** Current status is in `../docs/00_project_state/CURRENT_STATE.md`.

## Licence boundary and the runtime guard

Authority: `DEC-013`, [Licence Scope v1.5](../docs/01_masters/00_Licence_Scope_And_Feature_Lock_v1.5.md) and [Master Module Index v1.4](../docs/01_masters/03_Master_Module_Index_v1.4.md). Three things are kept separate:

- **A. Money Broking Spot (permanent prohibitions, every environment).** Internal client-to-client matching, an AIX order book for MB Spot, crossing or netting between clients, principal dealing, proprietary market making, AIX principal liquidity, spread mark-up and maker/taker fees are permanently prohibited in every environment, including local development. No approval lifts this (`LIC-RULE-002`).
- **B. AIX Exchange (securities domain).** A different domain from MB Spot. Its architecture and development are authorised (`DEC-013`; modules `EXM-01`, `EXO-01`, `EXC-01`, `EXP-01`), but **production activation remains gated** and fails closed. Authorising Exchange development grants MB Spot nothing (`LIC-RULE-005`).
- **C. What the code does today.** The boot-time guard `assertNoExchangeRuntime` (`packages/foundation/src/no-exchange.ts`) is **still active and unchanged**. It refuses any registered route path containing a prohibited fragment (including `exchange`, `order-book`, `matching-engine`, `client-to-client`), is called by all nine services, and is blind to domain and environment. `MIG-001`, the controlled migration to a domain-aware guard, is **specified but not authorised and not implemented**. Until it lands, an Exchange-domain service exposing any route that contains a prohibited fragment would be refused at boot, in every environment.

No Exchange-domain module exists in this codebase.

## Repository model & traceability

Code and documentation are one repository: `platform/` (this directory) and `docs/`. The earlier model of two sibling repositories no longer applies.

Code-to-blueprint linkage is kept in [`BLUEPRINT_VERSION`](./BLUEPRINT_VERSION), which records the master and per-module blueprint versions each module slice targets. **That file has not been re-pinned since the early foundation work and is out of date** (it still names the v1.3 masters and shows most implemented modules as `implemented: false`). Until it is re-pinned by a separate, approved change, treat [`../docs/DOCUMENT_REGISTER.md`](../docs/DOCUMENT_REGISTER.md) as the sole authority for document versions and `../docs/00_project_state/MODULE_STATUS.md` for implementation status.

## Stack

TypeScript · Node.js · Fastify · PostgreSQL · node-pg-migrate · DB-backed outbox/queue ·
Vitest · TypeBox validation.

## Layout

```
packages/foundation   @aix/foundation — shared FND-01 contracts (context, envelope, time,
                      db, idempotency, outbox, audit, no-exchange, config, environment)
services/             fnd, iam, iam2, sec1, cfg1, clt1, kyc1, aml1, wlt1 (Fastify)
apps/web              Next.js UI prototype (no API integration)
edge/                 UAT trusted-edge reference (IMP-02); not a production deployment
perf/                 IMP-02 capacity-measurement harness
infra/migrations      node-pg-migrate SQL migrations (001 … 071)
infra/grants          per-module DB role / least-privilege / RLS convention SQL
tests                 unit + app (no-DB) + DB-gated integration
```

## Status

Nine services exist (`fnd`, `iam`, `iam2`, `sec1`, `cfg1`, `clt1`, `kyc1`, `aml1`, `wlt1`), one shared package (`@aix/foundation`), a Next.js UI prototype (`apps/web`), a UAT trusted-edge reference (`edge/`) and a measurement harness (`perf/`); migration head is 071. Per-module acceptance state is in `../docs/00_project_state/MODULE_STATUS.md`; the UI has no API integration. Not production-ready.

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
