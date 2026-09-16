# IMP-02 measurement harness

**Status: foundation only (Turn M-A). No capacity calibration has been performed.**

This directory holds the IMP-02 M1–M8 capacity-calibration measurement harness, per the
governed architecture at `docs/03_implementation/IMP-02/README.md` and the independent Opus
architecture turn "IMP-02 M1-M8 CAPACITY CALIBRATION ARCHITECTURE" (`SELECTED — READY FOR
CONTROLLED MEASUREMENT-HARNESS IMPLEMENTATION`, no file changes). That architecture turn is the
authoritative reference for every design decision below — this README summarizes only what Turn
M-A actually built.

**Terminology:** this directory and everything under it uses "measurement", never "benchmark".
A local or UAT-shaped result is never automatically production-representative, and the word
"benchmark" implies exactly that.

## What Turn M-A built

- `src/schema.ts` — the `MeasurementResult` envelope, the `ResultStatus` model
  (`OBSERVED`/`PASS`/`FAIL`/`INCONCLUSIVE`/`INVALID`), and the controlled `MeasurementId` union
  (`M1`, `M2a`, `M2b`, `M3`, `M4`, `M5`, `M6`, `M7-UAT`, `M7-PROD`, `M8a` — deliberately no `M2`
  and no `M8b`; see below). Enforces the load-bearing invariant: `PASS`/`FAIL` require a
  non-empty `threshold_ref` naming a governed threshold; every other status forbids one.
- `src/run-id.ts` — deterministic-shape unique run identity (`run-<utc>-<nonce>-<shortsha>`).
  Never a performance signal, never derived from a secret.
- `src/environment-manifest.ts` — the environment fingerprint collector (provenance, host,
  runtime, database, service topology, placement, dataset). Mandatory fields fail explicitly
  when unavailable rather than substituting `"unknown"`.
- `src/secret-scan.ts` — the scanner run over every evidence payload before it is written.
  Detects PEM private-key markers, credential-embedded URLs, `Authorization: Bearer` values, and
  caller-supplied known-secret values. Reports category labels only, never the matched text.
- `src/evidence-store.ts` — atomic evidence writer, confined to `perf/evidence/`, enforcing
  construct → secret-scan → validate → write (never write-then-scan).
- `src/capacity.ts` — the pure `C_iam` calculator (homogeneous and heterogeneous forms).
  `UNDETERMINED` whenever process topology is unevidenced — never `0`, `null`, or an assumed
  value.
- `src/db-budget.ts` — the pure PostgreSQL global-capacity budget calculator (architecture §17).
  Arithmetic evidence only; never emits a recommended pool value.
- `src/m2a-observe.ts` — the M2a observer: reads the EFFECTIVE, runtime `pool.max` /
  `connectionTimeoutMillis` a controlled `@aix/foundation` `initPool()` call actually constructs,
  against a caller-supplied (scratch/non-production) database. Refuses to run against a dirty
  working tree.

## What Turn M-A deliberately did NOT build

Per this turn's explicit scope: no load generator (open-loop or closed-loop), no dataset seeder,
no continuous pool-counter sampler, no token corpus, and no `M1`/`M3`/`M4`/`M5`/`M6`/`M7`/`M8a`
result producer. Those are Turn M-B+.

## M2a vs. M2 — read this before using any M2a result

**M2a is not M2.** M2a observes the application-side half only — the effective pool
configuration a running process constructs with, read at runtime rather than assumed from
config. It says nothing about **M2b** — the deployment process topology (how many IAM processes
actually run in production) — which this repository currently has **no evidence source** for:
no Dockerfile, no compose file, no Kubernetes/Helm manifest, no PM2 ecosystem file, no systemd
unit, no `node:cluster` usage. `M2b` is **BLOCKED** on a deployment-topology decision that has
not yet been made, not on measurement effort.

Every M2a result's `does_not_prove` field states this explicitly. `C_iam` (`src/capacity.ts`)
returns `UNDETERMINED` — never a number — until both `pool.max` and `iam_processes_total` are
independently evidenced. A single local/dev process observing `iam_processes_total = 1` is
tagged `source: "observed_local_process"` and is **not** production topology evidence.

## Why there is no `M2` measurement ID, and no `M8b`

`schema.ts`'s `MeasurementId` union contains `M2a` and `M2b` but not `M2` itself — `M2`'s two
halves have entirely different evidence sources (one runtime-observable now, one blocked on a
deployment decision), and merging them into one identifier would invite exactly the "M2 complete"
overclaim this turn is forbidden from making.

Likewise there is no `M8b`. `K_max` (the number of legitimate clients expected to share one
governed source bucket) is a governance/demographic input — informed by expected client
population, carrier/NAT mix, and eventually real production traffic — not something a load
harness run locally could honestly measure. `M8a` (the NAT-fairness *mechanism* test, given an
*assumed* `K`) is an engineering measurement and is a valid future `MeasurementId`; `K_max`
itself is never a field this harness emits as though it were measured.

## Architectural blockers carried forward (not remediated in this turn)

These four gaps were surfaced by the IMP-02 M1-M8 architecture turn's source inspection. They are
recorded here as prerequisites for later measurement/calibration work. No governance finding ID
is assigned to any of them by this code turn — that is a governance decision, not an
implementation one.

1. **Production IAM process count / deployment topology does not yet exist.** Blocks `M2b`, and
   therefore blocks `C_iam` and every quantity derived from it (`R_max`, `R_budget`, `L_ip`).
2. **Total IAM request execution is currently unbounded after pool acquisition.** No
   `statement_timeout`, `idle_in_transaction_session_timeout`, `lock_timeout`, or Fastify
   `requestTimeout` exists anywhere in `services/`/`packages/`. `connectionTimeoutMillis` (the
   FND-FIND-010 seam) bounds acquisition only. Final connection-timeout calibration cannot yet
   satisfy the caller-timeout inequality (`T_acquire + T_execute + T_network < T_caller_timeout`)
   because `T_execute` has no upper bound.
3. **HAProxy currently has no governed stats socket.** `edge/haproxy.base.cfg` declares no
   `stats socket` and no stats listener. Authoritative `M7` (edge throughput / TLS handshake
   rate) remains blocked on that prerequisite.
4. **WLT's IAM caller timeout is currently hard-coded.** `IAM_CLIENT_TIMEOUT_MS = 5000` in
   `services/wlt1/src/lib/iam-client.ts` is a source constant, not a governed, configurable
   production input.

## Directory layout

```
platform/perf/
  README.md
  tsconfig.json
  src/
    schema.ts
    run-id.ts
    environment-manifest.ts
    evidence-store.ts
    secret-scan.ts
    capacity.ts
    db-budget.ts
    m2a-observe.ts
  evidence/
    .gitignore        # only this file is tracked — generated evidence is git-ignored
```

## Evidence retention

`perf/evidence/` follows the same convention as `edge/uat-topology/evidence/.gitignore` and
`edge/uat-tls/evidence/.gitignore`: `*` plus `!.gitignore`. Nothing generated by a run is ever
committed. `writeEvidenceAtomic()` additionally confines every write to inside this directory and
refuses any path that would escape it.

## Collection boundary

`vitest.config.ts` collects only `tests/**/*.test.ts`. Nothing under `platform/perf/` matches
that glob, so `npm test` never executes measurement code as a side effect of the canonical
suite. A small number of static/semantic unit tests **about** this harness live under
`platform/tests/unit/` (named `perf-*.test.ts`) — mirroring how the IMP-02 edge configuration is
covered by static tests without the edge itself living under `tests/`.

## Status-threshold discipline

`OBSERVED` is the default and will be the status of nearly every result this harness ever
produces. `PASS`/`FAIL` may only be emitted when `threshold_ref` names a genuinely governed,
approved threshold — `createMeasurementResult()` (`schema.ts`) enforces this structurally, and
will throw rather than allow a fabricated `threshold_ref` to pass. No production numeric
threshold is defined anywhere in this repository yet, so no producer built to date, or expected
in the near term, will legitimately emit `PASS`/`FAIL`.

## Running the M2a observer

There is no CLI entrypoint yet (Turn M-B+ scope). For now, `observeM2a()` is exercised by
`platform/tests/unit/perf-m2a-observe.integration.test.ts`, which — mirroring
`tests/integration/iam-db-pool-saturation.test.ts`'s own convention — self-skips unless
`TEST_DATABASE_URL` is set, and requires only a reachable scratch PostgreSQL server (no AIX
schema/migration needed, since `pool.connect()` only needs a valid TCP+auth handshake and
`pg_settings` is queried directly).
