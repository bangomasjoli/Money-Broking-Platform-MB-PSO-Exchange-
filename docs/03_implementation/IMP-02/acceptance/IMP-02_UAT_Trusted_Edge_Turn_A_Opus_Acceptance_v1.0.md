---
document_id: IMP-02-ACC-001
title: IMP-02 UAT Trusted Edge (Turn A) — Independent Acceptance (Opus, v1.0)
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: N/A
control: DEC-010 Layer L1 (trusted edge) UAT HTTP reference implementation — six-path allowlist, header strip/inject, pre-auth request-rate and connection limiting, HAProxy VERSION enforcement
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 65fca52
---

# IMP-02 UAT Trusted Edge (Turn A) — Independent Acceptance (Opus, v1.0)

| Item | Detail |
|---|---|
| Pack | `IMP-02` — `03_implementation/IMP-02/README.md`, the controlled owner of DEC-010 Layer L1 (trusted edge) and L2 (network isolation). Not a `02_modules/` entry; the 17-module delivery taxonomy is unchanged (see IMP-02 README §"Why IMP-02, and Not an 18th Module"). |
| Scope of this record | **Turn A only** — the L1 UAT trusted-edge HTTP reference implementation. Turn B (L2 mandatory network isolation, direct-to-WLT bypass proof) is a separate, later, NOT STARTED turn and is explicitly out of scope here. |
| Artifact | `platform/edge/haproxy.base.cfg`, `platform/edge/uat/haproxy.limits.cfg`, `platform/edge/validate.mjs`, `platform/edge/VERSION`, `platform/edge/README.md`, `platform/edge/production/README.md`, `platform/edge/uat/.env.example`, `platform/tests/unit/imp02-edge-config.test.ts` (new), `platform/tests/integration/imp02-edge-live.test.ts` (new), `platform/package.json` (`edge:validate` script) |
| Technology | HAProxy **3.0.27** (`3.0.27-a2b09cd`), pinned upstream source build (`https://www.haproxy.org/download/3.0/src/haproxy-3.0.27.tar.gz`, sha256 `c200b72ed5078d99d4bd658834478058409420b45d08dcec7e7a015e9c7b1dd1`, independently reproduced by two reviewers), built `make TARGET=osx`, no TLS (`USE_OPENSSL` deliberately not enabled — see §7). Not bundled with, or installed by, this repository. |
| Governance | `DECISION_LOG.md` DEC-010 (four-layer architecture) and the DEC-010 Turn 2 Prerequisites review that resolved L1/L2 ownership to `IMP-02`. This record implements and independently accepts IMP-02's own UAT provisional policy exactly as that pack already recorded it — it revises no architecture and approves no production number. |
| Implementation commits | `3d4c00f` (`feat(imp02): add UAT HAProxy trusted edge`) → independent review returned REVISE BEFORE ACCEPTANCE (E1/E2 blocking) → `65fca52` (`fix(imp02): harden UAT edge acceptance controls`, E1/E2 remediation) |
| Reviewer | Two independent Opus acceptance reviews: (1) initial review of `3d4c00f`, verdict REVISE BEFORE ACCEPTANCE; (2) narrow re-review of `65fca52`, verdict COMPLETE / ACCEPTED |
| Verification | Both reviews independently rebuilt HAProxy 3.0.27 from upstream source (not trusted from the implementer's report), ran live adversarial probes against the real assembled config via HTTP and the runtime stick-table admin socket, and independently reproduced the full canonical platform suite on a freshly migrated disposable Postgres |

---

## 1. Verdict

**IMP-02 TURN A — UAT TRUSTED EDGE: COMPLETE / ACCEPTED** (at `65fca52`).

The L1 UAT trusted-edge HTTP reference implementation — exact six-path allowlist, path-confusion rejection, `/internal/*` exclusion, wildcard `x-aix-*` header stripping, forwarding-header stripping, trusted `x-aix-perimeter-token` injection, IPv4 `/32`+`/24` and IPv6 `/64`+`/48` source-bucket limiting, bounded/evicting in-memory (never PostgreSQL) limiter state, TOTAL/READ/MUTATE request-rate limiting, aggregate limiting, a per-source TCP connection ceiling, `429`+`Retry-After`, edge-local `404`, `Cache-Control: no-store`, no wildcard CORS, and enforced pinning to the exact governed HAProxy version — is independently accepted as correctly implemented and correctly tested.

**This does NOT close `FND-FIND-001` and does NOT approve internet exposure.** Turn A is one of two IMP-02 turns; Turn B (L2 mandatory network isolation — the property that a direct probe to WLT-01 fails at the network layer) is **NOT STARTED**. TLS termination — named in IMP-02's own in-scope list — was **not implemented or validated** in Turn A; this is a deliberately deferred, not a defective, scope boundary (see §7). Production numeric pre-authentication policy remains **NOT APPROVED**. **FND-FIND-001 REMAINS HIGH/OPEN. INTERNET EXPOSURE REMAINS PROHIBITED.**

---

## 2. Scope / Diff

**`3d4c00f`:** 10 files, 1,163 insertions (0 deletions) — `platform/edge/**` (7 new files), 2 new test files, `platform/package.json` (+1 script line). **`65fca52`:** 4 files, 290 insertions / 15 deletions — `platform/edge/haproxy.base.cfg` (reorder), `platform/edge/validate.mjs` (version gate), both test files (new assertions). Across both commits: no migration, no grant, no dependency, no `services/`, `packages/`, or `docs/` change, no Dockerfile/Compose/Kubernetes/Terraform/cloud-provider commitment.

## 3. Phase 0 — Capability Verification (not re-litigated here, referenced)

Before any repository file was written, ten load-bearing HAProxy capabilities (binary IPv4/IPv6 prefix masking, bounded/evicting stick-tables, stick-counter capacity, wildcard header stripping, trusted header injection, fail-closed config guards, `429`+`Retry-After`, edge-local `404`, connection tracking, multi-config structural separation) were verified empirically against the real pinned binary — not assumed from documentation. Two genuine corrections surfaced only through that testing and were carried into the shipped config: threshold comparisons must use `gt`, never `ge` (self-inclusive counting under-admits by one); HAProxy's config parser does not support backslash line-continuation. Full record: the implementation and first-review transcripts this acceptance record summarizes.

## 4. E1 — Non-Admitted Traffic Cannot Poison Request-Rate Counters

**Finding (first review of `3d4c00f`):** the six-pair admission deny rule sat *after* `track-sc1..sc6`, so any request that was neither `/internal/*` nor path-confusion-flagged, but simply not one of the six governed pairs (unknown path, wrong method on a known path), still consumed a governed TOTAL/READ/MUTATE/aggregate counter before being denied. Proven exploitable: 300× unknown-path traffic inflated a shared `/24` aggregate bucket to 300, and with only that bucket left inflated, a single legitimate request was rejected.

**Fix (`65fca52`):** a pure reordering — the admission deny rule now executes before `track-sc1..sc6`; zero directive content changed. The TCP-layer connection ceiling (`sc0`) is unaffected, by design.

**Independent re-verification (second review), reproduced from a rebuilt binary against the live assembled config:**

| Probe | Result |
|---|---|
| 300× `/internal/wlt1/health` | 404×300, **counter delta 0** on all six request-rate tables |
| 300× `/wlt1/nope<N>` (the exact original defect case) | 404×300, **delta 0** |
| 12 denial classes × 60 requests (`//`, raw `..`, `%2f`, `%2F`, extra descendant, wrong method both directions, `PUT`, wrong case, trailing slash, 65-char id, root) — 720 requests | all 404, **delta 0 on every class** |
| Cross-source DoS regression: 1,500 denied requests, then one legitimate request | delta 0 throughout; legitimate request → **200**, not `429` |
| Positive tracking control: 15 legitimate GETs / 8 legitimate POSTs | `TOTAL=15,READ=15,AGG=15,MUTATE=0` / `TOTAL=8,MUTATE=8,AGG=8,READ=0` — exact class separation |
| Aggregate positive control: 1,100 allowlisted-only requests | `b_agg_60s` reached 1,100 (past its 960/60s threshold); with every primary table cleared, a legitimate request still received `429`/`retry-after: 60`/`RATE_LIMITED` — the aggregate is not a configured-but-unused table |
| Threshold semantics (`gt`, not `ge`) | MUTATE 10 admitted/11th rejected; READ 100/101st; TOTAL burst 20/21st; connections 50/51st — all exact |

**Static-test quality:** the four new Tier-1 assertions operate on the existing comment-stripped `baseCfgCode` helper — verified as a genuine oracle by replaying the assertion logic against the pre-fix `3d4c00f` config (FAILS) and the post-fix `65fca52` config (PASSES).

**E1: CLOSED.**

## 5. E2 — HAProxy Version Pin Is Enforced, Not Documentary

**Finding (first review):** `validate.mjs` never read `platform/edge/VERSION` nor parsed `haproxy -v`; a stub binary reporting `3.4.4-deadbeef` passed `edge:validate` cleanly.

**Fix (`65fca52`):** `validate.mjs` now reads `VERSION` from disk as sole source of truth (no duplicated hard-coded literal; the comparison is `reported.version !== pinned`, variable-to-variable), runs `<HAPROXY_BIN> -v`, extracts the reported core version via an anchored regex (`/^HAProxy version (\d+\.\d+\.\d+)(?:-\S+)?\s/m` — requires the literal line-start prefix, captures only `X.Y.Z`, excludes any build/pre-release suffix), and gates as the **first** step of `main()`, before any `-c` config check.

**Independent re-verification, both reviews concurring:**

| Case | Result |
|---|---|
| Real rebuilt HAProxy 3.0.27 (`3.0.27-a2b09cd`) | version pin **PASS**, all config checks **PASS**, exit 0 |
| Stub reporting `3.4.4-deadbeef` (the exact original defect case) | **fail closed**, exit 1, clear mismatch diagnostic |
| `3.0.26`, `3.0.28`, `3.1.5`, `3.2.0-abc` | each **fail closed**, exit 1 |
| Non-HAProxy output (`not-haproxy 3.0.27`) | unparseable, **fail closed**, exit 1 |
| Nonexistent `HAPROXY_BIN` | ENOENT, **fail closed**, exit 1 |
| Missing / empty / whitespace-only / `v3.0.27` / `3.0.27 LTS` / `3.0` VERSION file | each **fail closed** with a distinct diagnostic (tested on an out-of-repo copy; the committed `VERSION` was never modified) |
| Gate ordering | confirmed: on a version mismatch, **zero** `[PASS]`/`[FAIL]` config-check lines are ever emitted — the gate short-circuits before any `-c` execution |
| Parser false-positive probes | a mid-line, non-anchored mention of the pinned version is correctly rejected. One residual observation (not a finding): a binary emitting a *decoy* correct-version line before its real, different-version line passes — this requires an actively deceptive binary outside the control's threat model (accidental version drift), not closed by this record, noted for awareness only |

**Test quality:** the five new Tier-1 assertions cover disk-read, variable-to-variable comparison, suffix acceptance, anchoring/rejection, and `SEMVER_RE` strictness. Import-safety independently verified: importing `validate.mjs`'s exported helpers completes in single-digit milliseconds with no process spawn and no `process.exit` side effect (the CLI entry point is gated behind `process.argv[1] === fileURLToPath(import.meta.url)`).

**E2: CLOSED.**

## 6. Turn-A Regression — Independently Reconfirmed Unaffected

Six governed pairs all reachable; upstream sees only `host` + the trusted token (client spoof discarded, an unenumerated future `x-aix-*` header stripped, all five forwarding headers stripped); `Cache-Control: no-store` + `X-Content-Type-Options: nosniff` on proxied responses, no `Access-Control-Allow-Origin` anywhere; `/internal/*` → 404 including health/readiness; connection ceiling exact at 50 admitted/51st rejected (TCP-layer, no fabricated HTTP response); with the upstream killed, denials still 404 and the allowed route 503 — edge admit/deny/throttle decisions require no PostgreSQL, FND, IAM, or CLT; `platform/edge/production/` contains no `.cfg` file.

## 7. TLS Scope — Explicit Adjudication

DEC-010's L1 definition and IMP-02's own in-scope list both name **TLS termination** as part of IMP-02's eventual ownership. Turn A's reference binary was deliberately built without OpenSSL (`TARGET=osx`, no `USE_OPENSSL`), and no artifact in this Turn implements, validates, or claims TLS.

**Adjudicated as legitimately deferred, not a defect:** the same governing lists that name TLS also name "Network isolation" and "Direct-to-WLT bypass prevention (A3)" — both indisputably Turn B, not Turn A. IMP-02's own M7 calibration item ("Edge throughput / **TLS handshake rate** / connection capacity") places TLS measurement at the later production-calibration gate, consistent with a staged rollout. Every artifact under-claims rather than over-claims: `platform/edge/README.md` states "TLS-neutral routing", "no TLS — `USE_OPENSSL` was deliberately not enabled", "implements the **structural half** of L1", and "This is **L1 only**"; `haproxy.base.cfg` states "TLS termination is out of scope for this UAT reference." No document, config, or test in this Turn claims TLS implemented, HTTPS production-ready, or the production perimeter complete.

**TLS remains pending IMP-02 work — at minimum:** a TLS-capable edge runtime/build, certificate provisioning, certificate rotation, TLS configuration, M7 TLS-handshake capacity measurement, and production-shape validation. **This does NOT block Turn-A acceptance and does NOT itself constitute a finding** — it is a controlled scope boundary, now recorded explicitly so no future reader mistakes Turn A for a complete, production-capable L1.

## 8. Turn-A / Turn-B Split — Now Controlled

Prior to this record, neither `DECISION_LOG.md` DEC-010 nor `03_implementation/IMP-02/README.md` recorded an explicit sub-turn split within L1/L2 — DEC-010 stages L1+L2 together as a single "Turn 2." This ambiguity (E7 from the first review) is resolved by this record and the accompanying updates to `IMP-02/README.md` and `DECISION_LOG.md`:

- **Turn A** — L1 UAT trusted-edge HTTP reference implementation. **COMPLETE / ACCEPTED at `65fca52`** (this record).
- **Turn B** — L2 mandatory network isolation; direct-to-WLT bypass proof (abuse test A3). **NOT STARTED.**

Turn A's acceptance is not, and must never be read as, Turn B's acceptance, IMP-02's overall completion, or production perimeter readiness.

## 9. Independent Regression Reproduction

| Gate | Result |
|---|---|
| TypeScript `tsc -b` | 0 errors |
| Tier 1 (`imp02-edge-config.test.ts`) | 47/47 |
| Tier 2 (`npm run edge:validate`, real rebuilt 3.0.27 binary) | 6/6 (1 version gate + 5 config checks) |
| Tier 3 (`imp02-edge-live.test.ts`, live edge) | 23/23 |
| Migration head | `070` (70 migrations, unchanged) |
| Grants | all 9 byte-unchanged |
| **Full canonical platform, `--no-file-parallelism`** (fresh scratch Postgres, 70 migrations, 9 grant files) | **188/189 files passed** (1 correctly self-skipped without a live edge), **4980/5003 tests passed, 23 skipped, 0 failures** |

Reconciles exactly to the pre-Turn-A baseline (4993 total) + 9 new Tier-1 + 1 new Tier-3 = 5003.

---

## 10. Findings

No new findings are opened by this record. Four LOW, non-blocking residuals carried from the first review are registered in `OPEN_FINDINGS.md` under the new `IMP-02` section — none blocked Turn-A acceptance; all are pre-production hardening work:

| Finding ID | Origin | Severity | Status | Summary |
|---|---|---|---|---|
| **IMP-02-FIND-001** | E3 | LOW | OPEN | The Tier-3 fail-loud canary does not reliably detect the condition it claims to — reproduced passing against a WLT-01-impersonating target with no edge in the request path. Mitigated: 9 of the other 22 Tier-3 assertions fail loudly against the same non-edge target, so the suite as a whole is not vacuous. |
| **IMP-02-FIND-002** | E4 | LOW | OPEN | Edge-generated `404`/`429` responses do not carry the same `Cache-Control`/`X-Content-Type-Options` headers as proxied `200` responses (`http-response` rules do not apply to locally-generated denials); `404` uses HAProxy's default `text/html` body/content-type rather than the platform's JSON envelope shape. No topology leak; the allowed-surface headers are unaffected. |
| **IMP-02-FIND-003** | E5 | LOW | OPEN | `haproxy.base.cfg` contains literal `timeout connect 5s` / `timeout server 10s` in its `defaults` section, despite the file's own header claiming it contains no body/timeout value. No behavioural impact today (`b_gate` in `uat/haproxy.limits.cfg` sets the same values explicitly); a hypothetical future production limits file omitting these could silently inherit UAT-shaped defaults rather than failing closed. |
| **IMP-02-FIND-004** | E6 | LOW | OPEN | The majority (27 of 30) of `imp02-edge-config.test.ts`'s pre-existing Tier-1 positive assertions check raw config text rather than comment-stripped text, and are therefore theoretically satisfiable by a comment rather than a real directive. The four new E1 assertions added at `65fca52` are correctly comment-safe (verified as a genuine oracle, §4). |

`FND-FIND-001` (HIGH, pre-authentication abuse) and `FND-FIND-010` (MEDIUM, IAM pool capacity gap) are reaffirmed unchanged, not solved by this work, and remain outstanding — see `OPEN_FINDINGS.md`.

## 11. IMP-02 Overall Status

Acceptance of Turn A does not constitute IMP-02 completion. Unaffected and unresolved: Turn B (L2 network isolation, NOT STARTED); TLS termination (pending, §7); production numeric pre-authentication policy (NOT APPROVED — M1–M8 unmeasured, `U`/`N` unselected, A1–A10 not run at production shape); cloud provider and IaC tooling selection (ARC-11 §28, open); a named accountable human owner (`Unassigned`). **IMP-02 REMAINS IN_PROGRESS.**

## 12. FND-FIND-001 — Unaffected

Turn A does not close `FND-FIND-001`. Closure requires (per `IMP-02/README.md`'s own criteria, unchanged by this record): L1 deployed with *approved production* numbers (not UAT provisionals); L2 proven by external probe from outside the trust boundary; the full A1–A10 matrix passed at production shape; a measured, documented bound on unauthenticated-traffic-attributable `iam.auth_event` writes; `FND-FIND-010`'s IAM pool configuration addressed; independent acceptance at a named commit; and the associated governance updates. **`FND-FIND-001` REMAINS HIGH/OPEN.**

## 13. Documentation Impact

This record, plus updates to `docs/03_implementation/IMP-02/README.md` (Turn A acceptance, Turn A/Turn B split, TLS-pending state, updated status block), `DECISION_LOG.md` (DEC-010's Status field annotated in place — no new decision entry, baseline commit unchanged), `DOCUMENT_REGISTER.md` (this record registered; `IMP-02`'s own §4 row `implementation_status` updated to `IN_PROGRESS`), `OPEN_FINDINGS.md` (new `IMP-02` section registering IMP-02-FIND-001…004; `FND-FIND-001`/WLT-01/FND-01 cross-references updated), `00_project_state/MODULE_STATUS.md` and `PROJECT_HANDOVER.md` (chronology), and `02_modules/WLT-01/README.md` / `02_modules/FND-01/README.md` (minimal cross-reference updates).

## 14. Final Statement

**IMP-02 TURN A — UAT TRUSTED EDGE: COMPLETE / ACCEPTED (at `65fca52`).**
**E1, E2: CLOSED.**
**IMP-02-FIND-001 through IMP-02-FIND-004: OPEN (LOW, non-blocking pre-production hardening).**
**TURN B (L2 network isolation): NOT STARTED.**
**TLS TERMINATION: PENDING IMP-02 WORK — not implemented, not a Turn-A defect.**
**IMP-02 OVERALL: IN_PROGRESS — not complete.**
**FND-FIND-001: REMAINS HIGH/OPEN.** **FND-FIND-010: REMAINS OPEN.**
**PRODUCTION PRE-AUTH NUMERIC POLICY: NOT APPROVED.**
**INTERNET EXPOSURE: REMAINS PROHIBITED.**
