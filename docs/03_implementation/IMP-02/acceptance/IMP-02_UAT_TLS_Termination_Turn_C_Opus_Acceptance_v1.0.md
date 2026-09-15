---
document_id: IMP-02-ACC-003
title: IMP-02 UAT TLS Termination (Turn C) — Independent Acceptance (Opus, v1.0)
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: N/A
control: DEC-010 Layer L1 TLS capability — functional UAT TLS termination at the accepted trusted edge (governed HAProxy 3.0.27, USE_OPENSSL=1), ephemeral UAT certificate model, TLS 1.2-minimum protocol policy
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: d568fa0
---

# IMP-02 UAT TLS Termination (Turn C) — Independent Acceptance (Opus, v1.0)

| Item | Detail |
|---|---|
| Pack | `IMP-02` — `03_implementation/IMP-02/README.md`, the controlled owner of DEC-010 Layer L1 (trusted edge) and L2 (network isolation). Not a `02_modules/` entry; the 17-module delivery taxonomy is unchanged. |
| Scope of this record | **Turn C only** — functional UAT TLS termination at the accepted L1 edge, inside the same disposable Lima UAT harness Turn B established. Turn A (`IMP-02-ACC-001`) and Turn B (`IMP-02-ACC-002`) are otherwise unaffected. This record does NOT prove production certificate lifecycle, production cipher policy, backend TLS/mTLS, production L2, M7 capacity calibration, production numeric thresholds, or internet readiness. |
| Artifact | `platform/edge/uat-tls/{README.md,.env.example,make-certs.sh,tls-verify.sh,validate-tls.mjs,evidence/.gitignore,generated/.gitignore}` (all new), `platform/tests/unit/imp02-uat-tls-config.test.ts` (new, 36 tests), `platform/tests/integration/imp02-uat-tls-live.test.ts` (new, 22 tests, `TEST_TLS_LIVE`-gated), `platform/edge/haproxy.base.cfg` (**narrowly modified** — the sole previously-accepted artifact this turn changes), `platform/package.json` (`edge:tls:verify` script, +1 line) |
| Technology | HAProxy **3.0.27** (`3.0.27-a2b09cd`), same governed source tarball/digest as Turns A and B, built `TARGET=linux-glibc USE_OPENSSL=1` inside the same disposable Lima guest (never on macOS — no usable OpenSSL dev headers on the host). OpenSSL **3.0.13** (built-against and running-with identical). `libssl-dev 3.0.13-0ubuntu3.15 arm64`; actual runtime package `libssl3t64:arm64 3.0.13-0ubuntu3.15` (Ubuntu 24.04's 64-bit time_t transition naming — independently confirmed no package named `libssl3` exists). Ephemeral local UAT CA + leaf certificates, ECDSA P-256. |
| Governance | `DECISION_LOG.md` DEC-010 L1 (TLS termination, named in IMP-02's in-scope list, deferred by Turn A as an adjudicated non-defect) and the DEC-010 IMP-02 TLS UAT Architecture review (Opus, architecture-only, no file changes) that selected the guarded single-frontend `bind` modification over a second frontend, a hairpin TLS terminator, or PROXY protocol — each rejected for duplicating the perimeter or destroying the governed source-IP model. |
| Implementation commit | `d568fa0` (`feat(imp02): add UAT TLS edge termination`) — single commit, no remediation turn required |
| Reviewer | One independent Opus acceptance review of `d568fa0`, from a cold environment (implementer's Lima guest deliberately destroyed and rebuilt from scratch — fresh Lima download, checksum-verified, independent HAProxy build, independent certificate generation) |
| Verification | Independently rebuilt HAProxy 3.0.27 with `USE_OPENSSL=1` from the governed digest inside a cold guest; independently discovered the actual `libssl-dev`/runtime package identities rather than accepting the report; reproduced Turn-A's canonical Tier-3 condition (echo upstream) against the **modified** config in TLS-disabled mode to prove exact behavioural equivalence (23/23, not the previously-characterized 22/23); reproduced T1–T8 with precise per-test failure-cause verification (CA trust vs. hostname vs. expiry, each isolated to one variable); independently established TLS 1.0/1.1 client non-vacuity against a throwaway permissive listener before testing edge rejection; **closed four gaps the implementer explicitly left open** — all six governed routes individually probed over TLS, request-header stripping independently proven via an echo upstream, the full rate-limit ladder (MUTATE 10/11th, READ 100/101st, TOTAL burst 20/21st) independently re-driven over TLS to the exact governed boundary, and denied-traffic counter isolation (200 denied requests, zero counter movement) reconfirmed over TLS; proved source-IP spoofing (forged `X-Forwarded-For`/`X-Real-IP`/`Forwarded`) cannot evade the rate limiter: TLS did not alter the TCP-peer source model; reproduced the full canonical platform suite from a fresh scratch PostgreSQL (5,040/5,093 tests passed, 53 skipped, 0 failures); and fully reversed the guest, confirming Turn-A and Turn-B accepted artifacts remained byte-identical to their acceptance commits throughout. |

---

## 1. Verdict

**IMP-02 TURN C — UAT TLS TERMINATION: COMPLETE / ACCEPTED** (at `d568fa0`).

TLS terminates functionally at the accepted L1 edge, inside the disposable UAT harness Turn B established. A trusted-CA, correct-hostname client completes a genuine TLS handshake and reaches real WLT-01 (`401 WLT1_AUTH_REQUIRED`, full attribution). Untrusted CA, wrong hostname, and expired certificate each independently fail verification for their own distinct, isolated cause. TLS 1.0 and TLS 1.1 are genuinely rejected by the governed edge (proven non-vacuously — the rejecting client was first proven capable of completing those protocols against a permissive listener). TLS 1.2 and 1.3 succeed. All six governed public routes are admitted through the TLS edge and reach the real WLT chain; path-confusion and non-allowlisted probes remain edge-local denials. Request-header stripping, the full MUTATE/READ/TOTAL-burst rate-limit ladder, the 50-connection ceiling, and denied-traffic counter isolation all hold under TLS at the exact governed UAT boundaries. Turn-B's L2 isolation (`ENETUNREACH`) and Turn-B's own A3/positive/A4 property are both independently reconfirmed unaffected.

**This does NOT close `FND-FIND-001`, does NOT approve internet exposure, and does NOT establish any form of production readiness.** Turn C proves TLS is *functional* inside a disposable UAT harness — it does not select a production certificate authority, production cipher policy, backend TLS/mTLS, production SNI/Host policy, or perform M7 capacity calibration. **FND-FIND-001 REMAINS HIGH/OPEN. FND-FIND-010 REMAINS MEDIUM/OPEN. PRODUCTION L2 REMAINS NOT PROVEN/PENDING. M7 REMAINS NOT PERFORMED/PENDING. INTERNET EXPOSURE REMAINS PROHIBITED.**

---

## 2. Scope / Diff

`d568fa0`: 11 files, 1,275 insertions, **0 deletions** — `platform/edge/uat-tls/**` (7 new files), 2 new test files (36 + 22 tests), `platform/package.json` (+1 script line), and **exactly one previously-accepted artifact modified: `platform/edge/haproxy.base.cfg`** (+16 lines — one guarded `bind` directive and its fail-closed guard). No migration, no grant, no dependency, no lockfile change, no `services/`, `packages/`, or `docs/` change, no Dockerfile/Compose/Kubernetes/cloud-provider commitment, no backend TLS/mTLS.

## 3. Narrow Turn-A Re-Acceptance — Accepted-Artifact Delta

Independently verified by blob hash across `65fca52` / `db67b22` / `d568fa0`:

| Turn-A artifact | Result |
|---|---|
| `platform/edge/haproxy.base.cfg` | **CHANGED** — the sole modification this record narrowly re-accepts |
| `platform/edge/VERSION` | unchanged (`3.0.27`) |
| `platform/edge/validate.mjs` | unchanged |
| `platform/edge/uat/haproxy.limits.cfg` | unchanged |
| `platform/edge/uat/.env.example` | unchanged |

Turn-B artifacts (`uat-topology/lima.yaml`, `topology.sh`, `run-a3.sh`) all confirmed byte-identical to `7132057` — **zero Turn-B artifacts modified**. `libssl-dev` is installed guest-locally at runtime by `tls-verify.sh` itself rather than baked into the Lima template, which is why zero Turn-B artifacts were touched.

**The `haproxy.base.cfg` delta is a guarded, single-frontend, fail-closed modification** — not a second frontend, not a duplicated allowlist or limiter, not a hairpin proxy, not PROXY protocol, not an XFF-based source identity. Structurally confirmed: one `frontend fe_public`, exactly two `bind` directives living in mutually-exclusive `.if`/`.else` branches (never both active), one copy of the six-path allowlist, zero occurrences of `accept-proxy`, `send-proxy`, `option forwardfor`, or `http-request redirect`. The file retains **one effective public perimeter implementation**.

## 4. TLS-Disabled Equivalence — the Load-Bearing Re-Acceptance Question

Reproduced Turn-A's canonical Tier-3 condition (an echo upstream returning `200`) against the **modified** `haproxy.base.cfg` with `EDGE_TLS_ENABLED` unset:

| Gate | Result |
|---|---|
| Tier-1 (`imp02-edge-config.test.ts`) | **47/47**, against the modified file |
| Tier-2 (`edge:validate`) | **6/6**, against both the new TLS-capable binary and Turn-B's original unmodified plain binary |
| Tier-3 (`imp02-edge-live.test.ts`, canonical echo-upstream condition) | **23/23** |

**This is decisive, not the previously-characterized 22/23.** The guarded modification is proven behaviourally inert when TLS is not requested — the accepted Turn-A HTTP mode is unaltered.

## 5. TLS Build and Flag Semantics

Independently rebuilt from the governed source digest `c200b72ed5078d99d4bd658834478058409420b45d08dcec7e7a015e9c7b1dd1`, `TARGET=linux-glibc USE_OPENSSL=1`: `HAProxy version 3.0.27-a2b09cd`, feature flags `+OPENSSL +SSL`, "Built with OpenSSL version : OpenSSL 3.0.13", "Running on OpenSSL version : OpenSSL 3.0.13". No apt `haproxy` package, nothing named `haproxy` on the guest PATH — no distro substitution possible. Package identities independently discovered: `libssl-dev 3.0.13-0ubuntu3.15 arm64`; runtime resolved from the actual linked `.so` → `libssl3t64:arm64 3.0.13-0ubuntu3.15` (confirmed no package named `libssl3` exists on Ubuntu 24.04).

**`EDGE_TLS_ENABLED` is confirmed a pure presence flag**, reproduced against the real committed config:

| `EDGE_TLS_ENABLED` | Cert path | Result |
|---|---|---|
| unset | — | plain bind, exit 0 |
| `1` | valid | TLS bind, exit 0 |
| `1` / `false` / `0` / `true` | unset | **all fail closed, exit 1**, identical diagnostic |
| `1` | nonexistent / empty / garbage / directory / cert-without-key / key-without-cert | **all fail closed, exit 1** |

`false` and `0` behave identically to `1` — the branch is selected by *definition*, never by value. No plaintext fallback in any case tested.

## 6. Certificate Model

Ephemeral local UAT CA + three ECDSA P-256 leaf certificates, all genuine **X.509 v3** (not v1 — confirming the implementer's own mid-implementation fix of a `[req]`-vs-`[CA_default]` `x509_extensions` placement defect was durable): `valid` (SAN `uat-edge.aix.invalid`, current), `wrong-host` (SAN `wrong-host.aix.invalid`, **current/valid dates** — isolating T3 to hostname only), `expired` (SAN `uat-edge.aix.invalid`, **correct** — isolating T4 to time validity only, confirmed genuinely expired via `openssl x509 -checkend 0`). No production hostname, no production CA, no committed private key (grep-scanned across the committed tree and all generated evidence — none found), `generated/` and `evidence/` both git-ignored. Trust via explicit `--cacert` only; no system trust store — guest or macOS host — was ever modified.

## 7. T1–T4 and TLS Protocol Policy — Per-Test Failure Attribution

Each certificate negative test independently confirmed to fail for its **own distinct cause**, not merely a generic `000`:

| Test | Result | Cause |
|---|---|---|
| T1 | PASS — `SSL certificate verify ok`, then `401` | trusted CA + correct host |
| T2 | PASS — `unable to get local issuer certificate` | CA trust |
| T3 | PASS — `subjectAltName does not match uat-edge.aix.invalid` | hostname (CA was trusted) |
| T4 | PASS — `TLS alert, certificate expired (557)` | time validity (SAN and CA both correct) |

**TLS 1.0/1.1 rejection proven non-vacuously**: the default OpenSSL 3 client refuses locally (`no protocols available`) without ever sending a ClientHello, which would be a vacuous "rejection". A legacy-enabled client (`-cipher DEFAULT@SECLEVEL=0`) was first proven to **genuinely complete** TLS 1.0 and TLS 1.1 handshakes against a throwaway permissive `openssl s_server`, then that same capable client was tested against the governed edge: **T5/T6 PASS** — genuine `tlsv1 alert protocol version` (SSL alert 70), `Cipher is (NONE)`, no HTTP response. **T7/T8 PASS** — `TLSv1.2`/`ECDHE-ECDSA-AES256-GCM-SHA384` and `TLSv1.3`/`TLS_AES_256_GCM_SHA384` respectively.

## 8. HTTPS Application Evidence

**Positive control:** `ns_client` → TLS edge → real WLT-01, no bearer → `HTTP/2 401`, WLT's structured JSON envelope, `"code":"WLT1_AUTH_REQUIRED"`, `x-request-id`, `x-correlation-id`, plus the edge's own injected `cache-control: no-store` and `x-content-type-options: nosniff`.

**Invalid provenance over HTTPS:** edge deliberately injecting a wrong dummy perimeter token → `HTTP/2 404`, WLT's own envelope (`"code":"NOT_FOUND"`), `x-request-id`, `x-correlation-id`. **Independently distinguished from an edge-local 404**: a contrast probe to a non-allowlisted path returned bare `text/html`, `content-length: 83`, `cache-control: no-cache`, no request/correlation IDs. Valid token restored afterward → `401` returns.

## 9. L2 Regression Under TLS

From `ns_client`, direct to the WLT backend: `errno=101 (ENETUNREACH) Network is unreachable`; `ip route get` → `Network is unreachable`. Turn-B's L2 isolation is unaffected. Additionally, Turn-B's own unmodified `run-a3.sh` was run directly after all Turn-C TLS activity: A3, positive control, and A4 all independently reconfirmed PASS — Turn C did not weaken Turn B's own accepted property.

## 10. Six-Route TLS Evidence

Independently closed the gap the implementer explicitly left open. All six governed method/path pairs were individually probed over TLS and **none returned an edge-local 404**:

| Route | Result |
|---|---|
| `GET /wlt1/destinations` | `401` |
| `GET /wlt1/destinations/:id` | `401` |
| `POST /wlt1/wallet-destinations` | `400 VALIDATION_ERROR` (WLT-attributed) |
| `POST /wlt1/payout-destinations` | `400 VALIDATION_ERROR` (WLT-attributed) |
| `POST .../proof-of-control/challenges` | `400 VALIDATION_ERROR` (WLT-attributed) |
| `POST .../proof-of-control/verify` | `400 VALIDATION_ERROR` (WLT-attributed) |

These are **not** described as successful business transactions — the `VALIDATION_ERROR` responses prove the requests penetrated WLT's schema layer, which is the intended evidence (admission through the TLS edge to the real WLT chain, not edge-local denial). Eleven representative non-pairs/path-confusion probes (wrong method, unknown path, `/internal/*`, double slash, dot-dot, encoded slash, extra descendant, wrong case, trailing slash) all returned edge-local `404` with zero WLT attribution.

## 11. Request-Header Control Evidence

Independently closed the gap the implementer's report left as response-headers-only. Using an echo upstream to observe what actually reached the backend over TLS, a client sending a spoofed `x-aix-perimeter-token`, an arbitrary `x-aix-future-header`, and all five forwarding headers (`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Real-IP`, `Forwarded`) resulted in the upstream receiving **only** `accept`, `host`, `user-agent`, and `x-aix-perimeter-token` bearing the **trusted** edge-injected value (not the attacker's), appearing **exactly once** — no duplicate provenance header, every client-supplied `x-aix-*` and forwarding header stripped.

## 12. TLS Rate-Limit Ladder Evidence

Independently closed the gap the implementer's report left as untested, re-driven on a freshly restarted edge per boundary for counter isolation:

| Bucket | Governed UAT boundary | Independently observed over TLS |
|---|---|---|
| MUTATE | 10/60s | **10 admitted, 11th → 429** |
| READ | 100/60s | **100 admitted, first 429 at request #101** |
| TOTAL burst | 20/1s | **20 admitted, first 429 at request #21** |

`429` response shape confirmed over TLS: `retry-after: 60`, `{"success":false,"error":{"code":"RATE_LIMITED",...}}`.

## 13. Aggregate Boundary — Explicit Scope Limitation

**The aggregate `/24`–`/48` stick tables (`b_agg_60s`/`b_agg_1s`, 960/60s and 160/1s) were NOT independently re-driven to their numeric threshold over TLS in this review** — doing so requires 960+ paced requests, which was not performed. What was independently confirmed: the aggregate tables are declared, tracked (`track-sc5`/`sc6`), bounded (explicit `size`), and expiring (explicit `expire`) in the unmodified `uat/haproxy.limits.cfg`, on the identical post-termination rule path already exercised by the MUTATE/READ/TOTAL-burst tests above. **This record does not claim the aggregate TLS threshold was independently re-tested or the full numeric ladder independently re-driven in full** — the live aggregate-enforcement proof remains the one Turn A's own accepted plain-HTTP Tier-3 already established; TLS termination occurring before any of these rules evaluate is the structural reason the same enforcement code path applies, not a claim of numeric re-verification.

## 14. Denied-Traffic Counter Isolation (E1 Property) Under TLS

Independently reconfirmed. 200 denied requests flooded over TLS (unknown paths, `/internal/*`, dot-dot, wrong method) — all `404`, zero counter movement. A subsequent legitimate request returned `200`, not `429`.

## 15. Connection Limit and Source Identity

Governed UAT connection ceiling independently reproduced over TLS at its actual value: **50 raw TCP connections admitted, 51st `ConnectionResetError [Errno 104]`**, rejected before any TLS handshake byte was exchanged (pre-handshake). The Phase-0 implementation report's "3 admitted / 4th rejected" figure is reconciled as a deliberately reduced temporary threshold in a minimal scratch config, used solely to prove *ordering* with fewer connections during Phase 0 — not the governed value, and not misrepresented as such in the final record.

**Source identity independently proven to remain the TCP peer, not merely asserted absent of `accept-proxy`.** After exhausting the 20/1s TOTAL burst, retries carrying spoofed `X-Forwarded-For`/`X-Real-IP`/`Forwarded` headers across three different forged source IPs **all remained `429`** — header spoofing cannot mint a fresh rate-limit bucket under TLS.

## 16. Findings

Two new LOW, non-blocking findings are opened by this record, registered in `OPEN_FINDINGS.md` under the existing `IMP-02` section — neither blocked Turn-C acceptance:

| Finding ID | Origin | Severity | Status | Summary |
|---|---|---|---|---|
| **IMP-02-FIND-008** | Independent review, this turn | LOW | OPEN | `platform/tests/integration/imp02-uat-tls-live.test.ts` consumes the lexicographically-latest `evidence/` directory with no freshness or run-identity check. Independently reproduced: evidence from a prior successful run, backdated to 2026-01-01 with `tls-verify.sh` never re-run, still reported 22/22 passed. The fail-loud canary correctly catches *absent* evidence and assertions correctly catch *wrong* evidence, but not *stale* evidence — a deliberate architectural trade-off to avoid `child_process`-driven service lifecycle inside Vitest (the lesson `IMP-02-FIND-007` records), at the cost of a freshness gap the live suite alone cannot close (mitigated in practice: `evidence/` is git-ignored, so a clean checkout has none and the canary fires). | Add a deterministic freshness or run-identity check (e.g. a timestamp/nonce cross-referenced against the invoking shell, or a lock file cleared only by a genuine `tls-verify.sh` run) before Tier-3 alone is treated as proof of the current run, in a future IMP-02 hardening turn. Not fixed — out of scope for this turn. |
| **IMP-02-FIND-009** | Independent review, this turn | LOW | OPEN | `tls-verify.sh` scores T2/T3/T4 solely on transport-layer `000`, without asserting the specific intended failure cause (CA trust / hostname / expiry respectively). Any TLS-layer failure — including one caused by an unintended harness defect — would satisfy the current assertion. Independent review separately verified each test's actual failure reason (issuer error for T2, `subjectAltName does not match` for T3, `certificate expired` alert for T4) and confirmed all three fail for their intended cause in the harness's actual sequence; the risk is materially mitigated by T1 immediately preceding and requiring a genuine `401` through a working edge before each negative test's own explicit restart. | Strengthen `tls-verify.sh`'s T2/T3/T4 scoring to assert the OpenSSL-reported verification-failure reason, not merely the transport-layer status, in a future IMP-02 hardening turn. Not fixed — out of scope for this turn. |

`IMP-02-FIND-001` through `IMP-02-FIND-007` (Turns A and B, all LOW/OPEN) are preserved unchanged — this record neither closes nor worsens them. `FND-FIND-001` (HIGH) and `FND-FIND-010` (MEDIUM) are reaffirmed unchanged, not solved by this work.

## 17. Canonical Regression — Independently Reproduced

Reproduced from a fresh scratch PostgreSQL 17.10: all 70 migrations applied cleanly (head `070`, no `071`), all 9 grant files applied cleanly.

| Gate | Result |
|---|---|
| TypeScript `tsc -b` | 0 errors |
| Turn-B static / live | 24/24, 8/8 — unchanged |
| Full canonical, `--no-file-parallelism` | **190/193 files passed** (3 correctly self-skipped), **5,040/5,093 tests passed, 53 skipped, 0 failures** |
| Skip reconciliation | 53 = 23 (Turn-A Tier-3) + 8 (Turn-B live) + 22 (Turn-C live, self-skipped without `TEST_TLS_LIVE`) — exact |
| Migration head | `070` (70 migrations, unchanged) |
| Grants | all 9 byte-unchanged |

Reconciles exactly to the pre-Turn-C baseline (5,035, per `IMP-02-ACC-002`) + 36 new Tier-1 + 22 new live = 5,093.

## 18. IMP-02 Overall Status

Acceptance of Turn C does not constitute IMP-02 completion. Unaffected and unresolved: production certificate lifecycle (issuance, storage, rotation, revocation, monitoring); production cipher policy; production SNI/Host enforcement policy; backend/service-to-service TLS or mTLS; production deployment of L2; `FND-FIND-010`; M1–M8 capacity calibration (M7 specifically — no handshake-rate, throughput, or capacity figure was produced or claimed by this turn); production numeric pre-authentication policy; the full A1–A10 abuse-test matrix at production shape; production deployment acceptance; internet-exposure approval; a named accountable human owner (`Unassigned`). **IMP-02 REMAINS IN_PROGRESS.**

## 19. FND-FIND-001 — Unaffected

Turn C does not close `FND-FIND-001`. Closure still requires: L1+L2 deployed with *approved production* numbers at a real deployed topology; the full A1–A10 matrix at production shape; production TLS certificate lifecycle (Turn C's ephemeral UAT model confers nothing on this); `FND-FIND-010` addressed; independent acceptance at a named commit against that production deployment. **`FND-FIND-001` REMAINS HIGH/OPEN.**

## 20. Documentation Impact

This record, plus updates to `docs/03_implementation/IMP-02/README.md` (Turn C acceptance, TLS Status section, ownership table, Pack Contents, status block), `DECISION_LOG.md` (DEC-010's Status field annotated in place — no new decision entry, baseline commit unchanged), `DOCUMENT_REGISTER.md` (this record registered in §4b), `OPEN_FINDINGS.md` (IMP-02 section updated to record Turn C acceptance; `IMP-02-FIND-008`/`009` registered; `FND-FIND-001`/FND-01/WLT-01 section intros updated), `00_project_state/MODULE_STATUS.md` and `PROJECT_HANDOVER.md` (chronology), and `02_modules/WLT-01/README.md` / `02_modules/FND-01/README.md` (minimal cross-reference updates).

## 21. Final Statement

**IMP-02 TURN C — UAT TLS TERMINATION: COMPLETE / ACCEPTED (at `d568fa0`).**
**Exactly one previously-accepted artifact changed (`platform/edge/haproxy.base.cfg`); TLS-disabled mode independently reconfirmed behaviourally identical to accepted Turn-A HTTP mode (47/47, 6/6, 23/23 canonical).**
**T1–T8, HTTPS positive/invalid-provenance controls, six-route admission, path/header protection, the full rate-limit ladder, connection ceiling, and denied-traffic counter isolation: all independently reproduced PASS under TLS.**
**IMP-02-FIND-008 and IMP-02-FIND-009: OPEN (LOW, non-blocking).**
**IMP-02-FIND-001 through IMP-02-FIND-007 (Turns A/B): unchanged, OPEN (LOW, non-blocking).**
**IMP-02 OVERALL: IN_PROGRESS — not complete.**
**FND-FIND-001: REMAINS HIGH/OPEN.** **FND-FIND-010: REMAINS MEDIUM/OPEN.**
**PRODUCTION L2: NOT PROVEN / PENDING.** **M7 CALIBRATION: NOT PERFORMED / PENDING.**
**PRODUCTION PRE-AUTH NUMERIC POLICY: NOT APPROVED.**
**PRODUCTION TLS (certificate lifecycle, cipher policy, SNI/Host, backend TLS/mTLS): NOT ESTABLISHED — this record confers nothing on any of it.**
**INTERNET EXPOSURE: REMAINS PROHIBITED.**
