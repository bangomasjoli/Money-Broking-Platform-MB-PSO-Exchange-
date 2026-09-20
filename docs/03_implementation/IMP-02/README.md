---
document_id: IMP-02
title: AIX Platform Deployment and Perimeter Implementation Pack
version: v1.0
document_status: DRAFT
implementation_status: IN_PROGRESS
module: N/A
control: Trusted edge, network isolation, deployment perimeter
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 6262a81
---

# IMP-02 AIX Platform Deployment and Perimeter Implementation Pack v1.0

## Turn A / Turn B Split

DEC-010 stages IMP-02's L1+L2 scope as a single "Turn 2" in its own text; this
pack now records the controlled sub-turn split that Turn A's independent
acceptance made explicit:

- **Turn A — L1 UAT trusted-edge HTTP reference implementation.**
  **COMPLETE / ACCEPTED at commit `65fca52`.** Full record:
  [`acceptance/IMP-02_UAT_Trusted_Edge_Turn_A_Opus_Acceptance_v1.0.md`](acceptance/IMP-02_UAT_Trusted_Edge_Turn_A_Opus_Acceptance_v1.0.md)
  (`IMP-02-ACC-001`).
- **Turn B — L2 mandatory network isolation UAT proof** (the WLT listener
  must not be directly internet-reachable; proven by direct probe inside a
  disposable Lima UAT harness, abuse test A3). **COMPLETE / ACCEPTED at
  commit `7132057`.** Full record:
  [`acceptance/IMP-02_UAT_L2_Network_Isolation_Turn_B_Opus_Acceptance_v1.0.md`](acceptance/IMP-02_UAT_L2_Network_Isolation_Turn_B_Opus_Acceptance_v1.0.md)
  (`IMP-02-ACC-002`).
- **Turn C — UAT TLS termination** (functional TLS capability at the
  accepted L1 edge, inside the same disposable Lima UAT harness). **COMPLETE
  / ACCEPTED at commit `d568fa0`.** Full record:
  [`acceptance/IMP-02_UAT_TLS_Termination_Turn_C_Opus_Acceptance_v1.0.md`](acceptance/IMP-02_UAT_TLS_Termination_Turn_C_Opus_Acceptance_v1.0.md)
  (`IMP-02-ACC-003`).

**Turn A, Turn B, and Turn C acceptance together are not IMP-02's overall
completion, and are not production-perimeter readiness.** Turn B proves the
L2 isolation property, and Turn C proves TLS termination is functional, only
inside a disposable, provider-neutral UAT harness — neither proves
production network isolation, production certificate lifecycle, production
cipher policy, backend TLS/mTLS, production cloud topology, production
firewall/security-group configuration, production numeric limits,
production capacity, or internet readiness. No turn closes
`OPEN_FINDINGS.md` FND-FIND-001, and none approves internet exposure.

## TLS Status

**Functional UAT TLS termination is COMPLETE / ACCEPTED at commit `d568fa0`
(`IMP-02-ACC-003`) — production TLS readiness remains PENDING IMP-02 work.**
Turn A deliberately built a TLS-neutral HTTP UAT reference edge (HAProxy
compiled without OpenSSL — none of Turn A's required capabilities involved
TLS); this was an adjudicated scope deferral, not a defect (see
`IMP-02-ACC-001` §7). Turn C closes that deferral functionally: the same
governed HAProxy 3.0.27 source, rebuilt with `USE_OPENSSL=1` inside the
disposable Lima guest, terminates TLS 1.2/1.3 at the accepted edge via a
narrow guarded modification to `haproxy.base.cfg`'s `bind` directive (see
Pack Contents below), with an ephemeral, non-production UAT certificate
model. **Still pending, unaffected by Turn C:** production certificate
authority/lifecycle (issuance, storage, rotation, revocation, monitoring),
production cipher policy, production SNI/Host enforcement policy, backend/
service-to-service TLS or mTLS, the M7 TLS-handshake capacity measurement
below, and production-shape validation. **No document in this pack claims
production certificate lifecycle, production cipher policy, or the
production perimeter complete.**

## Purpose

This pack constitutes the controlled implementation owner of `DECISION_LOG.md`
DEC-010's L1 (trusted edge) and L2 (mandatory network isolation) layers — the two
layers that, once implemented and independently accepted, close `OPEN_FINDINGS.md`
FND-FIND-001 (HIGH, pre-authentication abuse). It exists because the preceding
Opus governance/architecture review (DEC-010 Turn 2 Prerequisites) found that no
deployment/infrastructure implementation owner existed anywhere in this
repository and that no existing owner could correctly absorb this scope (see
"Why IMP-02, and Not an 18th Module" below).

It is not a new system module. Like `IMP-01`, it is implementation governance —
the bridge from an already-accepted architecture decision (DEC-010) to a
deployed, independently-accepted control.

## Why IMP-02, and Not an 18th Module

`docs/DOCUMENT_REGISTER.md` §6 defines `03_implementation/` as "Master
implementation handover pack(**s**)" — an explicitly pluralized, extensible
tier. `IMP-01` already establishes this tier's shape: `module: N/A`
frontmatter, no blueprint lineage, registered in `DOCUMENT_REGISTER.md` §4
(Implementation Handover) rather than as a module blueprint or acceptance
record. `IMP-02` is a second instance of that same, already-governed document
class — not a new module.

This was deliberately decided against four alternatives, each rejected on
concrete evidence (full reasoning in the source Opus review, referenced under
Governing Decision below):

- **FND-01 extension** — rejected. FND-01's delivery vehicle
  (`platform/services/fnd`, migrations) cannot deliver TLS termination, a WAF
  ruleset, or network topology, and pointing the control at the same Postgres
  instance whose saturation is the threat is an availability inversion.
- **SEC-01 extension** — rejected. SEC-01 is an accepted **detective** control
  (audit log / security monitoring); L1/L2 are **preventive** network controls.
  Assigning them to SEC-01 would silently change an already-accepted module's
  control statement. SEC-01 remains the mandatory **evidence consumer** for
  L1/L2 rejections and isolation-probe results — a dependency, not ownership.
- **`02_modules/_cross_module/` scope** — rejected. That directory has no
  acceptance structure and no frontmatter identity capable of carrying
  `implementation_status`/`baseline_commit`/`owner`; more importantly,
  cross-module ownership is definitionally shared ownership, which is the
  exact ambiguity FND-FIND-001 already named as unresolved.
- **A new `02_modules/` blueprint pack** — rejected. It would require a new
  module ID colliding with catalogue rows already present in
  `01_masters/03_Master_Module_Index_v1.2.md` (`IAM-10` Rate Limiting and
  Abuse Protection, `VND-14` Cloud/Infrastructure Provider Control,
  `OPS-05`/`OPS-07`/`OPS-08`/`OPS-10`/`OPS-12`), a certified v1.1→v1.2
  blueprint delta-note lineage that does not exist, and a
  `document_status: APPROVED` blueprint authority this pack has no standing
  to grant.

**Therefore: the platform's 17-module delivery taxonomy (`docs/02_modules/`) is
unchanged. `IMP-02` adds zero module IDs, zero blueprint packs, and zero
`02_modules/` entries.**

## Governing Decision

`DECISION_LOG.md` DEC-010 (Public Perimeter / Pre-Authentication Abuse
Control, four-layer architecture) is the architecture this pack implements.
The DEC-010 Turn 2 Prerequisites Opus review (governance/architecture-only,
no code) resolved deployment ownership to IMP-02 and determined that
production numeric pre-auth thresholds cannot be approved without
measurement (see Numeric Policy below).

## Governing Masters

- **Primary:** `01_masters/11_Master_Deployment_Strategy_v1.2.md` (ARC-11) —
  §5.1 Recommended Deployment Pattern (Cloud VPC + WAF, private application
  runtime, private database, controlled egress, KMS/vault, monitoring, CI/CD).
- **Security constraints:** `01_masters/09_Master_Security_Architecture_v1.2.md`
  (ARC-09) — §9.1 Network Zones (Public Edge = WAF/DDoS/TLS), §9.2 Ingress
  Security (blocks direct service-to-service public exposure unless
  approved), §10.3 Rate Limiting and Abuse Protection (lists required
  rate-limited operations; fixes no numbers).

Both are `APPROVED` / `module: N/A` governance documents. Neither carries an
`implementation_status` or `baseline_commit` — they specify the perimeter;
`IMP-02` is their missing implementation-tier counterpart. Their approved
authority is unmodified by this pack; only cross-references are added.

## Scope

### In scope (IMP-02 owns exclusively)

- TLS termination — **UAT: ACCEPTED (`d568fa0`, Turn C)**; production
  readiness PENDING (see TLS Status above)
- Exact six-public-path allowlist (`/internal/*` never proxied) — **Turn A: ACCEPTED**
- Pre-authentication source-based throttling — **Turn A: ACCEPTED (UAT provisional values only)**
- Inbound stripping of any client-supplied `x-aix-*` provenance header
- Injection of the authentic `x-aix-perimeter-token` (custody/rotation at the
  edge; the token's WLT-01-side validation is unaffected, see Out of Scope)
- Security headers and `Cache-Control: no-store` on public responses
- CORS policy
- Request-body ceiling and connection ceilings
- Network isolation — the WLT listener must not be directly internet-reachable
- Direct-to-WLT bypass prevention, proven by external probe (abuse test A3)
- Edge configuration and provider-neutral IaC / deployment artifacts
- Edge/perimeter observability
- Abuse-test execution evidence (A1–A10)

### Out of scope (explicitly not IMP-02)

- WLT-01's L3 application gate + perimeter-provenance admission — owned by
  WLT-01, **COMPLETE / ACCEPTED at commit `af52fe8`**
  (`02_modules/WLT-01/acceptance/WLT-01_Public_Perimeter_Application_Gate_Opus_Acceptance_v1.0.md`).
  Do not modify `platform/services/wlt1`.
- DEC-009's authenticated FND-01 rate-limit engine and its numeric policy —
  owned by FND-01, unchanged.
- IAM-01 authentication/introspection semantics.
- CLT-01 membership authority.
- Any database migration or grant.
- Business functionality of any kind.
- The internet-exposure approval itself — a separate governance act, not
  satisfied by IMP-02 implementation or acceptance alone.

## Ownership Table

| Layer | Owner | Status |
|---|---|---|
| L1 trusted edge — Turn A (UAT HTTP reference) | **IMP-02** | **ACCEPTED (`65fca52`)** |
| L1 trusted edge — TLS termination — Turn C (UAT functional) | **IMP-02** | **ACCEPTED (`d568fa0`)** |
| L1 trusted edge — TLS termination — production lifecycle | **IMP-02** | PENDING |
| L1 trusted edge — production numeric policy | **IMP-02** | NOT APPROVED |
| L2 network isolation — Turn B (UAT proof) | **IMP-02** | **ACCEPTED (`7132057`)** |
| L2 network isolation — production deployment | **IMP-02** | NOT PROVEN / PENDING |
| L3 app gate + perimeter provenance | WLT-01 | ACCEPTED (`af52fe8`) |
| L4 authenticated chain + rate-limit engine | FND-01 / IAM-01 / CLT-01 | ACCEPTED (`eb4a767`) |
| FND-FIND-001 register-holder | FND-01 | HIGH / OPEN |
| L1/L2 evidence ingestion | SEC-01 (consumer, not owner) | Dependency |

## Numeric Policy — Production NOT APPROVED

**No production pre-authentication rate-limit numbers are approved by this
pack or by DEC-010's Turn 2 Prerequisites review.** The load-bearing capacity
inputs are not yet measured:

- `S_neg` — negative-introspection DB service time (one indexed SELECT plus
  one autocommit `iam.auth_event` INSERT and commit; the table has no
  retention/eviction policy today, so cost grows with accumulated volume).
- IAM deployed concurrency — `pool.max` × total live IAM processes across the
  named deployment. The application-side mechanism is now explicitly
  governed (`OPEN_FINDINGS.md` FND-FIND-010, CLOSED at `6af0d25`) and its
  runtime value is now independently observable (Measurement Harness Turn
  M-A, `IMP-02-ACC-004` — see below) — but the deployment-side factor
  (production IAM process/instance count) has no evidence source anywhere in
  this repository, so production `C_iam` remains **UNDETERMINED**. See IAM
  Capacity Gap below.
- Deployment shape (instance counts, edge node count) — undetermined; ARC-11
  §28 lists cloud provider and launch capacity/headroom thresholds as open.
- `K_max` — distinct legitimate clients observed per source bucket (NAT/CGNAT
  fairness).
- `U`, `N` — risk-appetite terms (headroom fraction conceded to
  unauthenticated traffic; tolerated simultaneous abusive source buckets).
  These are policy sign-off terms, not engineering derivations.

No value for any of the above is invented anywhere in this pack.

### Capacity formula (architecture/calibration guidance only — not approved numbers)

```
C_iam     = IAM pool.max × IAM process count
R_max     = C_iam / S_neg
R_budget  = R_max × U
L_ip      = R_budget / N          subject to: L_ip >= K_max × (DEC-009 frl_wlt1_read_list rate)
```

**`C_iam` model, refined by the M1-M8 architecture turn and implemented as
pure calculation helpers in Measurement Harness Turn M-A
(`platform/perf/src/capacity.ts`, `IMP-02-ACC-004`):** `IAM process count`
means `iam_processes_total` — the TOTAL count of live IAM processes across
the entire named deployment, never a separate "process count" and "instance
count" silently multiplied together. For homogeneous IAM processes,
`C_iam = pool.max × iam_processes_total`; for heterogeneous pool sizes,
`C_iam = Σ(pool.max_i)`. **If deployment process-topology evidence is
absent — which it currently is, repository-wide — `C_iam` is
`UNDETERMINED`, never `0`, never `1`, never an assumed value.**

### Provisional INTERNAL-UAT policy — NOT APPROVED FOR PRODUCTION

**PROVISIONAL. INTERNAL-UAT / STAGING ONLY. NOT APPROVED FOR PRODUCTION.**
Authorized solely to permit Turn 2 engineering and abuse-test exercise in
`uat`/`staging` (per `IMP-01`'s environment list). These values are not
derived from measurement.

| Bucket | Subject | Provisional UAT value |
|---|---|---|
| `preauth_total` | source bucket | 120 requests / 60 s, burst 20 / 1 s |
| `preauth_read` | source bucket, GET on the two public read paths | 100 requests / 60 s |
| `preauth_mutate` | source bucket, POST on the four public mutate paths | 10 requests / 60 s |
| Concurrent connections | source bucket | 50 |
| Request body ceiling | per request | Must be explicitly configured at the edge. **No numeric value approved** — do not invent one. |
| Idle / header / connection timeout | per connection | Must be explicitly configured at the edge. **No numeric value approved** — do not invent one. |

**UAT policy safety (mandatory):**

- These values MUST NOT be promoted automatically to production.
- Production edge configuration must remain absent/disabled until a separate
  controlled numeric-policy approval exists (consistent with ARC-11 §26
  `feature_flag_default = disabled` and with WLT-01's L3 fail-closed default).
- UAT and production edge artifacts must be structurally separated — no
  shared default file may allow a UAT threshold to become a production
  default.
- Every UAT value must be labelled inline in the edge configuration itself as
  `PROVISIONAL — UAT ONLY — NOT APPROVED FOR PRODUCTION`.

## Source-Bucket Policy (decided; not a capacity number)

- **IPv4 primary bucket:** `/32`. **Secondary aggregate:** `/24` at **8×** the
  primary limit (contains trivial small-block rotation without punishing a
  single shared office egress).
- **IPv6 primary bucket:** `/64` — never `/128` (a single host is routinely
  allocated a full `/64`; `/128` bucketing is defeated at zero attacker
  cost). **Secondary aggregate:** `/48` at **8×** the primary limit.
- Source identity comes **only** from the edge's own TCP peer — never from
  `X-Forwarded-For` or any client-supplied header. `trustProxy` remains
  unconfigured platform-wide; this must not change as a side effect of L1
  work. L1 must strip inbound forwarding headers so they cannot later be
  trusted downstream.

## Route Classification (decided; not a capacity number)

L1 uses **three** logical counters — `TOTAL`, `READ`, `MUTATE` — not
per-route (six-way) weighting. `READ` = the two public GET paths; `MUTATE` =
the four public POST paths. The read:mutate ratio is fixed at **10:1**,
inherited from DEC-009's approved 100:10 authenticated shape, so L1 cannot
contradict an already-approved L4 policy. The ratio is decided; its absolute
scale is not.

## Multi-Instance Enforcement Requirement (mandatory acceptance criterion)

The edge must present **exactly one logical enforcement point**: either a
single enforcement node, or multiple nodes sharing counter state in a common
store. **Independent per-node counters using the full approved limit on every
node are PROHIBITED** (observing `n × L_ip` platform-wide is a failed
acceptance criterion — abuse test A9). Shared counter state must **not** use
the protected PostgreSQL database — a pre-auth control that reads its limits
from the resource it protects is not a pre-auth control.

## HTTP Semantics (decided)

- **Throttle exceeded:** `429`, `Retry-After` where supported, error code
  `RATE_LIMITED` (existing `SYS-RULE-005`-mapped code — no new code minted).
- **Non-allowlisted path:** `404`, shape-identical to WLT-01's L3 rejection —
  never `403` (a `403` would confirm the path exists).
- L3's perimeter-provenance rejection remains `404 NOT_FOUND`, unchanged by
  this pack — L1 (429, possibly-legitimate source) and L3 (404, unauthorised
  provenance) are different controls with intentionally different semantics
  and must not be conflated.
- No response at any layer may disclose perimeter topology, secrets, IAM
  state, or internal identifiers.

## NAT / CGNAT Fairness

Source-IP throttling's known failure mode is collective punishment of shared
egress (CGNAT, corporate NAT). Production per-source policy approval
requires a measured `K_max` (distinct legitimate clients per source bucket,
measurement M8 below) and validation that the chosen limit does not
throttle legitimate shared-egress traffic (abuse test A7). **UAT provisional
values in this pack are not claimed to be NAT-safe for production.**

## Capacity Calibration Framework — Required Measurements

Environment: `uat`/`staging`, provisioned to production **shape**
(topology, instance counts, hardware class), provider-neutral. All
measurements are controlled evidence: commit SHA, environment descriptor,
dataset sizes, and raw data retained. **None of M1–M8 has been performed as
of this pack's creation.**

| ID | Measurement |
|---|---|
| M1 | Negative-introspection DB service time — mean/p95/p99 — **NOT PERFORMED** |
| M2a | Deployed `pool.max` (application-side, runtime-observable) — **OBSERVATION CAPABILITY BUILT** by Measurement Harness Turn M-A (`IMP-02-ACC-004`); no production value observed, since only a controlled non-production pool was ever run |
| M2b | IAM process/instance count (deployment-side) — **BLOCKED**; no Dockerfile/compose/Kubernetes/PM2/systemd/`node:cluster` artifact exists anywhere in this repository from which a production process count could be read |
| M3 | IAM legitimate login/introspection latency under attack — **NOT PERFORMED** |
| M4 | Authenticated WLT public-route latency under attack — **NOT PERFORMED** |
| M5 | IAM pool saturation and post-saturation behaviour — **NOT PERFORMED** |
| M6 | `iam.auth_event` unauthenticated-traffic write amplification — **NOT PERFORMED** |
| M7 | Edge throughput / TLS handshake rate / connection capacity — **NOT PERFORMED**; Turn C proved TLS is functional, never how fast it is; no benchmark/capacity figure was produced or claimed |
| M8 | `K_max` — distinct legitimate clients per source bucket — **NOT PERFORMED**; `K_max` itself is a governance/demographic input, not an engineering measurement (see Measurement Harness Turn M-A below) |

**M2 is deliberately split into M2a/M2b above, not recorded as one row.**
Merging them invites exactly the "M2 complete" overclaim the M1-M8
architecture turn and Turn M-A were both explicitly instructed to avoid —
M2a being observable does not mean M2 is complete; M2b remains the blocking
factor.

## Measurement Harness — Turn M-A

**FOUNDATION ONLY. No capacity calibration has been performed by this turn.**
Implemented at commit `d57b436` (`feat(imp02): add measurement harness
foundation`), independently accepted `COMPLETE / ACCEPTED`. Full record:
[`acceptance/IMP-02_Measurement_Harness_Turn_M-A_Opus_Acceptance_v1.0.md`](acceptance/IMP-02_Measurement_Harness_Turn_M-A_Opus_Acceptance_v1.0.md)
(`IMP-02-ACC-004`). Platform source: `platform/perf/` (`platform/perf/README.md`
is the implementation-level reference; this section records only the
governance-relevant boundary).

Turn M-A built the **trusted measurement foundation** the M1-M8 framework
above depends on, and nothing beyond it:

- A controlled result schema (`OBSERVED`/`PASS`/`FAIL`/`INCONCLUSIVE`/
  `INVALID`, `OBSERVED` the default) enforcing — independently verified
  against direct malformed-object attack, not merely the shipped tests —
  that `PASS`/`FAIL` require a non-empty `threshold_ref` naming a governed,
  approved threshold, and that every other status forbids one. No governed
  threshold exists anywhere in this repository yet, so no producer may
  legitimately emit `PASS`/`FAIL`.
- An environment fingerprint (provenance/host/runtime/database/
  service_topology/placement/dataset) that fails explicitly on a missing
  mandatory field rather than substituting `"unknown"`.
- A secret scanner and atomic evidence writer enforcing construct →
  secret-scan → validate → write (never write-then-scan), confined to
  `platform/perf/evidence/` (git-ignored).
- An **M2a observer** — reads the EFFECTIVE, runtime `pool.max` /
  `connectionTimeoutMillis` a controlled `@aix/foundation` `initPool()` call
  actually constructs against a caller-supplied (non-production) database,
  independently verified against an independently-constructed control `pg
  Pool` across two distinct configurations. **M2a is not M2** — see the
  M2a/M2b table split above and "M2a Boundary" immediately below.
- Pure `C_iam` and DB-wide connection-budget calculation helpers — see the
  refined capacity formula above and "DB-Budget Boundary" below.

**Explicitly NOT built:** a token corpus, a load generator (open-loop or
closed-loop), a dataset seeder, or a continuous pool-counter sampler. No
`M1`/`M3`/`M4`/`M5`/`M6`/`M7`/`M8a` result was produced or claimed.

### M2a Boundary

M2a may observe: runtime `pool.max`, runtime `connectionTimeoutMillis`. It
does **NOT** establish: M2 completion, production IAM process count,
production `C_iam`, throughput capacity, or any approved pool value. A local
`iam_processes_total = 1` observation is tagged `source:
"observed_local_process"` in every result — it is a single harness-owned
process in that run, never production deployment topology.

### DB-Budget Boundary

The Turn M-A DB-wide connection-budget calculator
(`platform/perf/src/db-budget.ts`) provides **arithmetic evidence only** —
`Σ(service pool.max × process count) + reserved + admin allowance` versus
PostgreSQL `max_connections`. It never emits a recommended, safe, or
approved IAM pool value; every input is caller-supplied, with zero embedded
production defaults. Production DB-wide capacity still requires explicit
deployment facts this repository does not yet have.

### Four Architectural Blockers (surfaced by inspection, not remediated)

Independently confirmed accurate during the acceptance review; no
remediation was performed by Turn M-A, and no new `IMP-02-FIND` ID is
assigned to the blockers themselves (they are prerequisites, not defects):

1. **Production IAM process/deployment topology does not yet exist.** Blocks
   M2b and, therefore, production `C_iam`.
2. **Total IAM request execution after acquiring a DB connection is
   currently unbounded.** No `statement_timeout`,
   `idle_in_transaction_session_timeout`, `lock_timeout`, or Fastify
   `requestTimeout` exists anywhere in `services/`/`packages/`. The
   FND-FIND-010 `connectionTimeoutMillis` seam bounds acquisition only, so
   the final IAM-acquisition-timeout / WLT-caller-timeout inequality cannot
   yet be made enforceable.
3. **HAProxy has no governed stats socket or runtime stats surface.**
   `edge/haproxy.base.cfg` declares neither — authoritative M7 remains
   blocked on that prerequisite.
4. **WLT's IAM caller timeout is currently hard-coded.**
   `IAM_CLIENT_TIMEOUT_MS = 5000` in `services/wlt1/src/lib/iam-client.ts`
   is a source constant, not yet a governed, configurable production input.

### Independent Review Findings

Registered in `OPEN_FINDINGS.md`'s `IMP-02` section as `IMP-02-FIND-010`
through `IMP-02-FIND-013` (severities LOW/LOW/LOW/INFORMATIONAL — none
blocked acceptance; see that section for full text). **Turn M-B gate:
`IMP-02-FIND-010` and `IMP-02-FIND-011` MUST be closed before Turn M-B
introduces any externally-influenced path segment or untyped/CLI/JSON
entrypoint** — both findings are contained today only because Turn M-A's
producers are exclusively internal, typed, TypeScript callers. **Both were closed by `IMP02-MA-HARDEN-001` at commit `9b0bab7` (`IMP-02-FIND-010`, `IMP-02-FIND-011`; see their rows in `OPEN_FINDINGS.md`): the gate's condition is satisfied. Turn M-B has not started.**

## Abuse-Test Matrix — IMP-02 Acceptance Obligations

These are **obligations**, not completed tests. Pass criteria use
already-approved Charter §18 / SRS NFR-SRS-001 values (1,000 concurrent
users; normal API < 300 ms; heavy API < 1,000 ms; error rate < 1%) so no new
numeric approval is required to execute them.

| ID | Scenario |
|---|---|
| A1 | Single-source invalid-bearer flood |
| A2 | Distributed / rotating-source flood |
| A3 | Direct-to-WLT isolation probe (external, outside the trust boundary — a rejection produced by L3 is a **FAIL**, since it proves reachability) |
| A4 | L3 missing-perimeter-token regression (zero IAM calls, zero DB writes — as proven at `af52fe8`) |
| A5 | Slowloris / connection exhaustion |
| A6 | Oversized / malformed pre-auth bodies |
| A7 | NAT / shared-egress fairness |
| A8 | Non-allowlisted path probing |
| A9 | Multi-node counter integrity |
| A10 | Header-injection stripping (`x-aix-perimeter-token`, `X-Forwarded-For`) |

## Production Numeric Approval Process

Production pre-auth thresholds are high-risk configuration and fall under
catalogue **OPS-05 Production Change Control**. Approval requires **all** of:

1. Complete M1–M8 evidence pack (raw data retained).
2. Explicit, written, signed selection of risk-policy terms `U` and `N`
   (risk-appetite decisions, not computed values).
3. Full A1–A10 matrix passed at production shape, including A7 and A9.
4. Independent acceptance review at a named commit (established convention:
   `IAM-01-ACC-003`, `FND-01-ACC-003`, `WLT-01-ACC-001`/`002`).
5. A `DECISION_LOG.md` entry recording the approved numbers as authority of
   record.
6. OPS-05 maker-checker sign-off (maker ≠ checker).

**Numbers are never approved by an ungoverned environment variable.** Approved
production numbers live as version-controlled edge configuration, deployed
only through the OPS-10 pipeline; drift between deployed configuration and
the `DECISION_LOG.md` value of record is a reportable finding, not a
discrepancy to reconcile quietly.

### Named accountable human owner

**UNASSIGNED.** Consistent with every module `owner:` field in this
repository, no individual is named here. Designating the accountable human
(referencing OPS-05 / OPS-12 / OPS-14 role framing as appropriate) is itself
an outstanding governance prerequisite, tracked separately — not invented by
this pack.

## IAM Capacity Gap — Cross-Reference

**`OPEN_FINDINGS.md` FND-FIND-010 is CLOSED (`6af0d25`).** The `@aix/foundation`
shared connection pool (`packages/foundation/src/db.ts`) gained a narrow
`{ max?, connectionTimeoutMillis? }` seam, and IAM-01 alone gained explicit
`IAM_DB_POOL_MAX`/`IAM_DB_CONNECTION_TIMEOUT_MS` configuration (required in
`prod`, optional elsewhere) — the eight other services remain unaffected.
**Closure means the application-side capacity INPUTS are now explicitly
governed — it does NOT mean capacity calibrated, any production pool value
approved, or M1/M2/M5 complete.** Measurement Harness Turn M-A
(`IMP-02-ACC-004`) subsequently built the ability to OBSERVE this seam's
runtime effective values (M2a); M2b (deployment process count) and the
M1/M3-M8 measurements themselves remain entirely unperformed. See "Measurement
Harness — Turn M-A" above.

## Pack Contents

Turn A landed real implementation artifacts under `platform/edge/`:
`haproxy.base.cfg` (structure — six-path allowlist, path-confusion rejection,
`/internal/*` exclusion, header strip/inject, security headers), `uat/
haproxy.limits.cfg` (every governed PROVISIONAL numeric threshold),
`validate.mjs` (Tier-2 `haproxy -c` validation with enforced HAProxy VERSION
pinning), `VERSION` (`3.0.27`), `uat/.env.example`, and `production/README.md`
(no `.cfg` file — no production configuration exists). Full inventory and
independent verification: `IMP-02-ACC-001`.

Turn B landed a disposable UAT isolation harness under
`platform/edge/uat-topology/`: `lima.yaml` (a single provider-neutral Lima
guest template, `vmType: vz`, no host root), `topology.sh` (namespace/veth
orchestration, HAProxy/WLT-01 lifecycle inside the guest), `run-a3.sh` (the
three frozen tests — A3 direct-bypass, positive control, A4 L3 regression —
and evidence capture), `README.md`, and a git-ignored `evidence/` directory.
Turn B references Turn A's real `haproxy.base.cfg`/`uat/haproxy.limits.cfg`
at runtime rather than duplicating them. Full inventory and independent
verification: `IMP-02-ACC-002`.

Turn C landed a disposable UAT TLS harness under `platform/edge/uat-tls/`:
`make-certs.sh` (ephemeral local CA + valid/wrong-host/expired leaf
certificates, ECDSA P-256, non-production), `tls-verify.sh` (T1–T8
certificate/protocol tests, HTTPS application controls, six-route/header/
rate-limit regression, evidence capture), `validate-tls.mjs` (Tier-2 TLS
config/capability validation, importing `validate.mjs`'s helpers rather
than duplicating them), `README.md`, `.env.example`, and git-ignored
`generated/`/`evidence/` directories. Turn C's ONLY modification to a
previously-accepted artifact is a narrow, guarded, fail-closed addition to
`platform/edge/haproxy.base.cfg`'s `bind` directive (`EDGE_TLS_ENABLED` — a
presence flag, unset for the accepted Turn-A HTTP mode); Turn-B's
`uat-topology/lima.yaml` and `topology.sh` are unmodified — `libssl-dev` is
installed guest-locally by `tls-verify.sh` at runtime instead. Full
inventory and independent verification: `IMP-02-ACC-003`.

No Dockerfile, Docker Compose, Kubernetes manifest, Terraform, or
cloud-provider selection exists anywhere in this pack — those remain out of
scope for Turn A, Turn B, and Turn C without a separate decision.

Measurement Harness Turn M-A landed a trusted measurement-foundation
instrument under `platform/perf/`: `schema.ts` (result envelope,
status/threshold model), `run-id.ts`, `environment-manifest.ts`,
`evidence-store.ts`/`secret-scan.ts` (construct → scan → validate → write,
confined to git-ignored `evidence/`), `capacity.ts` (pure `C_iam`
calculator), `db-budget.ts` (pure DB-wide budget calculator), and
`m2a-observe.ts` (the M2a runtime observer) — plus `README.md` and
`tsconfig.json`. `platform/perf/` is outside Vitest's `tests/**/*.test.ts`
collection glob (independently confirmed: 207 collected files, zero under
`perf/`) but is fully typechecked via a `platform/tsconfig.json` project
reference. Ten new test files (`platform/tests/unit/perf-*.test.ts` ×9,
`platform/tests/integration/perf-m2a-observe.test.ts` ×1, the latter
DB-gated). Zero `services/`/`packages/`/`edge/`/`infra/` changes. Full
inventory and independent verification: `IMP-02-ACC-004`.

## Status

```txt
IMP-02 status (overall) = IN_PROGRESS — Turn A/B/C + Measurement Harness Turn M-A accepted, production L2 + TLS + calibration pending
Turn A (L1 UAT trusted-edge HTTP reference) = COMPLETE / ACCEPTED at 65fca52
Turn B (L2 network isolation, UAT proof) = COMPLETE / ACCEPTED at 7132057
Turn C (UAT TLS termination, functional) = COMPLETE / ACCEPTED at d568fa0
Measurement Harness Turn M-A (foundation only) = COMPLETE / ACCEPTED at d57b436
Production L2 network isolation (deployed) = NOT PROVEN / PENDING
TLS termination (UAT, functional) = ACCEPTED (Turn C, d568fa0)
TLS termination (production lifecycle/cipher/SNI/backend mTLS) = PENDING
L3 = WLT-01, COMPLETE / ACCEPTED at af52fe8
Production numeric pre-auth policy = NOT APPROVED
Internal-UAT provisional policy = AUTHORIZED, non-production only, IMPLEMENTED in Turn A
M1 = NOT PERFORMED
M2a (application-side pool.max, runtime-observable) = OBSERVATION CAPABILITY BUILT (Turn M-A); no production value observed
M2b (deployment IAM process count) = BLOCKED — no evidence source exists in this repository
M2 (overall) = NOT COMPLETE
Production C_iam = UNDETERMINED
M3/M4/M5/M6 = NOT PERFORMED
M7 (TLS handshake rate / capacity) = NOT PERFORMED / PENDING
M8a (NAT-fairness mechanism) = NOT PERFORMED; K_max (governance/demographic input) = NOT AN ENGINEERING MEASUREMENT
Cloud provider = OPEN (ARC-11 §28 #1)
IaC tooling = OPEN (ARC-11 §28 #5)
Named accountable human owner = UNASSIGNED
FND-FIND-001 = HIGH / OPEN (no turn closes it)
FND-FIND-010 = CLOSED at 6af0d25 (IAM pool capacity INPUTS now governed; does not mean calibrated or M2/M5 complete)
IMP-02-FIND-001..004 = LOW / OPEN (non-blocking Turn-A hardening residuals)
IMP-02-FIND-005..007 = LOW / OPEN (non-blocking Turn-B hardening residuals)
IMP-02-FIND-008..009 = LOW / OPEN (non-blocking Turn-C hardening residuals)
IMP-02-FIND-010 = LOW / CLOSED at 9b0bab7 (IMP02-MA-HARDEN-001; Turn M-B gate condition satisfied; see OPEN_FINDINGS.md)
IMP-02-FIND-011 = LOW / CLOSED at 9b0bab7 (IMP02-MA-HARDEN-001; Turn M-B gate condition satisfied; see OPEN_FINDINGS.md)
IMP-02-FIND-012 = LOW / OPEN (non-blocking Turn-M-A hardening residual)
IMP-02-FIND-013 = INFORMATIONAL / OPEN (bundled Turn-M-A test/scanner refinement observations)
Internet exposure = PROHIBITED
```

## Cross-references

- `DECISION_LOG.md` DEC-010 — governing architecture decision.
- `03_implementation/IMP-02/acceptance/IMP-02_UAT_Trusted_Edge_Turn_A_Opus_Acceptance_v1.0.md`
  (`IMP-02-ACC-001`) — Turn A independent acceptance, full evidence record.
- `03_implementation/IMP-02/acceptance/IMP-02_UAT_L2_Network_Isolation_Turn_B_Opus_Acceptance_v1.0.md`
  (`IMP-02-ACC-002`) — Turn B independent acceptance, full evidence record.
- `03_implementation/IMP-02/acceptance/IMP-02_UAT_TLS_Termination_Turn_C_Opus_Acceptance_v1.0.md`
  (`IMP-02-ACC-003`) — Turn C independent acceptance, full evidence record.
- `03_implementation/IMP-02/acceptance/IMP-02_Measurement_Harness_Turn_M-A_Opus_Acceptance_v1.0.md`
  (`IMP-02-ACC-004`) — Measurement Harness Turn M-A independent acceptance,
  full evidence record. Foundation only — no capacity calibration performed.
- `OPEN_FINDINGS.md` FND-FIND-001 — the finding IMP-02 exists to close, and
  FND-FIND-010 (CLOSED) — the IAM capacity-gap cross-reference — plus the
  `IMP-02` section (IMP-02-FIND-001 through IMP-02-FIND-013, LOW/
  INFORMATIONAL, non-blocking).
- `02_modules/WLT-01/acceptance/WLT-01_Public_Perimeter_Application_Gate_Opus_Acceptance_v1.0.md` — L3, already accepted.
- `02_modules/FND-01/acceptance/FND-01_Rate_Limit_Hardening_Opus_v1.0.md` — L4 authenticated engine.
