# IMP-02 — UAT Trusted Edge (DEC-010 Layer L1)

This directory is the implementation of `docs/03_implementation/IMP-02/README.md`'s Layer L1
(trusted edge) reference, using HAProxy 3.0.27. It is implementation usage guidance only — for
governance scope, ownership, the four-layer DEC-010 architecture, the production numeric approval
process, and the M1-M8/A1-A10 frameworks, see:

- `docs/03_implementation/IMP-02/README.md` — IMP-02 ownership and scope
- `docs/DECISION_LOG.md` DEC-010 — the governing architecture decision

This README does not duplicate that governance history.

## What this is

`platform/edge/haproxy.base.cfg` implements the structural half of L1: TLS-neutral routing for
the exact six public `/wlt1/*` routes, path-confusion rejection, `/internal/*` denial,
provenance-header stripping and trusted-token injection, minimal API security headers, and the
tracking (but not enforcement) of pre-authentication rate/connection counters.

`platform/edge/uat/haproxy.limits.cfg` carries every governed **PROVISIONAL — UAT ONLY — NOT
APPROVED FOR PRODUCTION** numeric threshold — the stick-table declarations and the actual
`gt <N>` enforcement comparisons.

Loading `haproxy.base.cfg` alone is deliberately non-functional (proven by
`npm run edge:validate` and `platform/tests/unit/imp02-edge-config.test.ts`) — the base file
references stick-tables and a forwarding backend that only `uat/haproxy.limits.cfg` declares.
This is the structural mechanism that makes "production inherits UAT" impossible: there is
currently no production limits file, so there is currently no way to run this edge outside UAT.

## Layer boundary — read before touching anything else in this repository

This is **L1 only**. `platform/services/wlt1` implements L3 (already `COMPLETE / ACCEPTED` at
commit `af52fe8`) and must not be modified from here. `platform/packages/foundation` and
`platform/services/fnd` implement L4 (DEC-009) and are likewise out of scope. **L2 (mandatory
network isolation — the property that a direct probe to WLT-01 fails at the network layer) is
NOT implemented by anything in this directory** and is a separate, later Turn B. Running this
edge does not prove, and must never be represented as proving, that WLT-01 is unreachable
directly.

## Version

HAProxy `3.0.27` (see `VERSION`). Acquired as a pinned upstream source build
(`https://www.haproxy.org/download/3.0/src/haproxy-3.0.27.tar.gz`,
sha256 `c200b72ed5078d99d4bd658834478058409420b45d08dcec7e7a015e9c7b1dd1`), built with
`make TARGET=osx` (no TLS — `USE_OPENSSL` was deliberately not enabled; none of this edge's
required capabilities involve TLS). Every load-bearing syntax choice in these config files was
verified against a real HAProxy 3.0.27 binary — not assumed from documentation — during IMP-02's
Phase 0 capability-verification gate. `platform/tests/unit/imp02-edge-config.test.ts` asserts
`VERSION` and this README's stated version reconcile with the version comment structure the
config files carry.

## Running locally

Requires a HAProxy 3.0.27 binary on `PATH` or referenced via `HAPROXY_BIN` (see
`npm run edge:validate` below — no HAProxy is bundled with, or installed by, this repository).

```sh
cp platform/edge/uat/.env.example platform/edge/uat/.env   # then fill in real UAT values
set -a; source platform/edge/uat/.env; set +a
haproxy -f platform/edge/haproxy.base.cfg -f platform/edge/uat/haproxy.limits.cfg
```

## Validation

```sh
npm run edge:validate
```

Runs `haproxy -c` against the assembled base+UAT config with the required environment present
(positive case), and separately proves the negative cases (base alone; missing perimeter token;
missing upstream address) all fail closed. See `platform/edge/validate.mjs`.

## Tests

- **Tier 1** (`platform/tests/unit/imp02-edge-config.test.ts`) — static assertions on the
  committed config text. Runs everywhere, no HAProxy binary required.
- **Tier 2** — `npm run edge:validate` (above). Requires a real HAProxy 3.0.27 binary.
- **Tier 3** (`platform/tests/integration/imp02-edge-live.test.ts`) — real HTTP behavioural
  tests against a running edge. `describe.skipIf(!process.env.TEST_EDGE_BASE_URL)`, mirroring
  this repository's established `*-real.test.ts` external-dependency pattern. The edge process
  lifecycle is never managed from Vitest (matches this repository's existing convention of never
  spawning `child_process` from a test file) — start the edge yourself, then run:

  ```sh
  TEST_EDGE_BASE_URL=http://127.0.0.1:18080 npm test -- imp02-edge-live
  ```

## Not in this directory

No Dockerfile, Docker Compose, Kubernetes manifest, Terraform, or cloud-provider binding of any
kind. `platform/edge/production/` contains no `.cfg` file — see its own `README.md`. L2 network
isolation (the topology that proves a direct-to-WLT probe fails) is Turn B, not built here.
