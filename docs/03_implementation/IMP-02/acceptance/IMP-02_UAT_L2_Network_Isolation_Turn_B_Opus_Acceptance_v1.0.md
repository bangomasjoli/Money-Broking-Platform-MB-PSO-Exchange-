---
document_id: IMP-02-ACC-002
title: IMP-02 UAT L2 Network Isolation (Turn B) — Independent Acceptance (Opus, v1.0)
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: N/A
control: DEC-010 Layer L2 (mandatory network isolation) UAT proof — direct-to-WLT bypass prevention (abuse test A3), positive edge-path control, L3 regression through the isolated topology (A4)
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 7132057
---

# IMP-02 UAT L2 Network Isolation (Turn B) — Independent Acceptance (Opus, v1.0)

| Item | Detail |
|---|---|
| Pack | `IMP-02` — `03_implementation/IMP-02/README.md`, the controlled owner of DEC-010 Layer L1 (trusted edge) and L2 (network isolation). Not a `02_modules/` entry; the 17-module delivery taxonomy is unchanged. |
| Scope of this record | **Turn B only** — the L2 UAT network-isolation proof (direct-to-WLT bypass prevention, abuse test A3) inside a disposable, provider-neutral Lima UAT harness. Turn A (L1 UAT trusted edge, `IMP-02-ACC-001`) is unaffected and unmodified. This record does NOT prove production network isolation. |
| Artifact | `platform/edge/uat-topology/{README.md,lima.yaml,topology.sh,run-a3.sh,evidence/.gitignore}` (all new), `platform/tests/unit/imp02-uat-topology-config.test.ts` (new), `platform/tests/integration/imp02-uat-topology-live.test.ts` (new), `platform/package.json` (`edge:topology:verify` script, +1 line) |
| Technology | Lima **2.2.0** (Darwin arm64, `vmType: vz` — Apple Virtualization.framework, no host root), disposable Ubuntu 24.04 arm64 guest, genuine Linux network namespaces + veth pairs (no Docker/Podman/Colima/container runtime anywhere). HAProxy **3.0.27** (`3.0.27-a2b09cd`) built inside the guest from the SAME governed source digest as Turn A (`c200b72ed5078d99d4bd658834478058409420b45d08dcec7e7a015e9c7b1dd1`), independently reproduced. Real, unmodified `services/wlt1`. |
| Governance | `DECISION_LOG.md` DEC-010 L2 (mandatory network isolation — the WLT listener must not be directly internet-reachable) and the DEC-010 Turn 2A L2 UAT isolation topology-selection review (Opus, architecture/environment decision only, no file changes) that selected Lima + Linux network namespaces as the provider-neutral UAT mechanism, over Docker Desktop/Colima/Podman (heavier footprint, second HAProxy provenance path) and macOS `pf` (root-required, non-automatable, cannot model a genuine trust boundary on one shared host stack). |
| Implementation commit | `7132057` (`feat(imp02): add UAT L2 isolation topology`) — single commit, no remediation turn required |
| Reviewer | One independent Opus acceptance review of `7132057`, from a cold environment (Lima entirely absent — no `~/.lima`, freshly downloaded and checksum-verified) |
| Verification | Independently downloaded and checksum-verified Lima 2.2.0 against upstream `SHA256SUMS`; built the entire three-namespace topology from scratch under a separate instance name; independently rebuilt HAProxy 3.0.27 inside the guest and verified its source digest; proved WLT-01 was genuinely alive (real request/correlation IDs, correct L3 discrimination) BEFORE attempting A3; reproduced A3 in its strongest form (raw-socket `ENETUNREACH`, not a timeout); ran an adversarial test adding an explicit backend route to `ns_client` to prove `ns_edge`'s disabled forwarding independently blocks it; deliberately killed the edge process to prove the A3/positive-control fail-loud coupling; reproduced Turn-A's Tier-1 (47/47), Tier-2 (6/6), and Tier-3 (23/23, under Turn-A's own canonical echo-upstream condition) regressions; independently stood up a scratch PostgreSQL, applied all 70 migrations and all 9 grants, and reproduced the full canonical suite (5004/5035 tests passed, 31 skipped exactly = the two env-gated live files, 0 failures); confirmed zero internet/host exposure of the topology; fully reversed the guest and confirmed the repository returned to a byte-identical clean state. |

---

## 1. Verdict

**IMP-02 TURN B — L2 UAT ISOLATION: COMPLETE / ACCEPTED** (at `7132057`).

Within a disposable, provider-neutral Lima UAT harness, a direct probe from the modeled external/test-client trust zone (`ns_client`) to the real WLT-01 backend address:port fails at the network layer with no HTTP response obtainable (independently reproduced as raw-socket `errno 101 ENETUNREACH`), while the same client through the real, unmodified Turn-A HAProxy edge reaches real WLT-01 application logic (`401 WLT1_AUTH_REQUIRED`), and the same isolated topology, with the edge deliberately injecting a wrong perimeter token, still receives WLT's own unmodified L3 rejection (`404 NOT_FOUND`, independently attributed via structured JSON envelope and generated request/correlation IDs, not an edge-generated denial).

**This does NOT close `FND-FIND-001` and does NOT approve internet exposure or any form of production readiness.** Turn B proves the L2 isolation *property* only inside a disposable UAT harness — it does not prove production network isolation, production TLS, production cloud topology, production firewall/security-group configuration, production numeric limits, production capacity, or internet readiness. TLS termination remains **PENDING IMP-02 work**, unaffected by this turn. Production numeric pre-authentication policy remains **NOT APPROVED**. **FND-FIND-001 REMAINS HIGH/OPEN. FND-FIND-010 REMAINS OPEN. INTERNET EXPOSURE REMAINS PROHIBITED.**

---

## 2. Scope / Diff

`7132057`: 8 files, 939 insertions, **0 deletions** — `platform/edge/uat-topology/**` (5 new files), 2 new test files, `platform/package.json` (+1 script line). No migration, no grant, no dependency, no lockfile change, no `services/`, `packages/`, or `docs/` change, no Dockerfile/Compose/Kubernetes/Terraform/cloud-provider commitment, no TLS implementation. Independently confirmed Turn-A artifacts (`haproxy.base.cfg`, `uat/haproxy.limits.cfg`, `validate.mjs`, `VERSION`) are byte-identical across `65fca52` → `cade4e0` → `7132057` (same blob hashes) — Turn B references these files at runtime rather than duplicating, forking, or rewriting them.

## 3. Topology and Real-Component Proof

Three genuine Linux network namespaces inside one disposable Lima guest (`vmType: vz`, no host root, no sudoers change, nothing installed on the macOS host): `ns_client` (10.80.0.2/24, `net_public` only — no interface, no route, no policy route to `net_backend`), `ns_edge` (10.80.0.1/24 + 10.90.0.1/24 — the only namespace on both networks), `ns_backend` (10.90.0.2/24, `net_backend` only). Independently verified:

- **Real HAProxy 3.0.27**, source digest `c200b72ed5078d99d4bd658834478058409420b45d08dcec7e7a015e9c7b1dd1` — exact match to the governed pin, rebuilt inside the guest via `TARGET=linux-glibc`. No distro/package-manager HAProxy present (`dpkg -l` empty, nothing on guest PATH).
- **Real, unmodified `services/wlt1`** — process resolves to `node … tsx services/wlt1/src/index.ts`, running in a distinct network namespace from root; guest-side digests of the copied `services/wlt1/src/index.ts`, `haproxy.base.cfg`, `uat/haproxy.limits.cfg`, and `VERSION` are byte-identical to repository HEAD.
- **Zero live dependencies** — no Postgres, IAM, IAM-02, CLT, FND, or AML instantiated. Independently confirmed WLT-01 boots and serves its L3 gate correctly with placeholder configuration on **two platforms** (inside the guest, and separately on macOS).

## 4. A3 — Direct-Bypass Proof (Load-Bearing)

**WLT-01 was independently proven alive BEFORE A3 was attempted** — from `ns_edge`: no perimeter token → `404 NOT_FOUND`; wrong token → `404`; valid token → `401 WLT1_AUTH_REQUIRED`, each response carrying generated `x-request-id`/`x-correlation-id` and WLT's structured JSON envelope, proving real application logic with a correctly discriminating L3 gate, not a stub.

A3 was then reproduced in its **strongest available form**, not merely accepted from `curl`'s exit code:

| Probe | Result |
|---|---|
| `ip route get 10.90.0.2` from `ns_client` | `RTNETLINK answers: Network is unreachable` |
| Raw Python socket connect | `errno 101 (ENETUNREACH)`, immediate (0 ms) |
| `curl -v` | `Immediate connect fail for 10.90.0.2: Network is unreachable`, exit 7, `http_code=000` |
| `ip route show table all` / `ip rule show` in `ns_client` | Only `10.80.0.0/24`; no default route, no host route, no policy route to the backend |

This is the strongest possible A3 outcome: not a timeout (which would suggest a blackhole/firewall) and not `ECONNREFUSED` (which would prove the host reachable with a closed port), but the network genuinely not existing from `ns_client`'s perspective — an architectural absence of reachability, exactly as required. Re-confirmed three times in the same execution (before, immediately after, and after the full A4 cycle).

## 5. Root Namespace and Forwarding (Load-Bearing)

Independently inspected, not accepted from script comments. The guest **root namespace** holds only `lo` and `eth0` (Lima's own usernet) — no veth, no bridge; all four veth ends live inside the three namespaces. Root has no route to `10.80.0.0/24` or `10.90.0.0/24`; a connect attempt from root to WLT timed out (Lima's usernet gateway, not the topology). `net.ipv4.ip_forward` and `net.ipv6.conf.all.forwarding` are explicitly `0` in **all three namespaces and in guest root**; nftables ruleset empty; iptables carries default-ACCEPT policy chains with zero rules — no NAT, no DNAT, no bypass path exists to flush.

**Adversarial defense-in-depth test:** an explicit route (`ip route add 10.90.0.0/24 via 10.80.0.1`) was added inside `ns_client`. The connection still failed (timeout) because `ns_edge` itself refuses to route — proving isolation rests on two independent controls (absent route, and disabled forwarding), not one.

## 6. Positive Control and A3/Positive Coupling (Load-Bearing)

From the **same** `ns_client`, in the same topology execution: `GET /wlt1/destinations` through the real edge returned exactly `401 WLT1_AUTH_REQUIRED`, with `cache-control: no-store` and `x-content-type-options: nosniff` present (HAProxy's own injected headers, absent from the direct-from-`ns_edge` response) — confirming HAProxy genuinely processed the request rather than the response merely resembling WLT's shape. A client-spoofed `x-aix-perimeter-token` sent through the edge was independently confirmed stripped (still 401, not 404).

**Fail-loud coupling independently reproduced by deliberately breaking the path**: HAProxy was killed in `ns_edge` and `run-a3.sh` re-run. A3 alone still returned `000` (would have passed in isolation), but the positive control failed, and the harness correctly emitted `A3 verdict WITHHELD … Overall result is FAIL` with `verdict.txt = FAIL`. A3 is never reportable PASS on a broken-but-isolated network.

## 7. A4 — L3 Regression Through the Isolated Topology

Edge restarted (via the committed harness, env-var only — `services/wlt1` and `haproxy.base.cfg` never touched) with a deliberately wrong dummy perimeter token. `ns_client` through the edge received `404`. **Independently distinguished as WLT's own L3 rejection, not an edge-generated denial**: the A4 404 carries `x-request-id`, `x-correlation-id`, `content-type: application/json`, and `{"error":{"code":"NOT_FOUND"}}`; a contrast request to a non-allowlisted path was independently confirmed to receive the edge's own bare `text/html` 404 with none of those markers. Valid token restored afterward; the positive control (`401`) and A3 (`000`) were both independently reconfirmed working immediately after A4.

## 8. Internet Exposure

Independently determined to be conclusively absent. The macOS host could not reach `10.80.0.1:8080` or `10.90.0.2:8090`; nothing listened on host `:8080`/`:8090`; Lima's hostagent log showed **zero** TCP port forwards. The topology's listeners do not appear in the guest root namespace at all (only `systemd-resolve` and `sshd` do), so Lima's forwarding agent cannot enumerate — let alone forward — them, independently corroborating `lima.yaml`'s own comment explaining why no `portForwards` override is needed.

## 9. Turn-A Regression — Independently Reconfirmed Unaffected

- **Tier-1** (`imp02-edge-config.test.ts`): 47/47, reproduced on host.
- **Tier-2** (`npm run edge:validate`, real rebuilt guest binary): 6/6, including the version-pin gate and all fail-closed negative cases.
- **Tier-3** (`imp02-edge-live.test.ts`): a direct macOS reproduction against Turn B's newly-built binary initially returned 22/23 or 21/23 depending on upstream condition — diagnosed as an artifact of the reachability/rate-limit tests' own environment assumptions (both explicitly written for an upstream echo server returning `200`, per the tests' own comments), not a Turn-B regression. Reproducing Turn-A's canonical echo-upstream condition yielded **23/23**. Six routes, header strip/injection, version pin, rate limits, connection limit, and production-config absence are all confirmed unaffected — Turn B modified none of the files these tests exercise.

## 10. Turn-B Test Quality

**Tier 1** (`imp02-uat-topology-config.test.ts`, 24/24): genuinely semantic — parses `ip netns add`/`ip link set … netns …` calls to assert exact namespace membership (not comment text), requires `sysctl -w` (a set, not merely a read), and reads `edge/VERSION` as the single source of truth for the HAProxy pin rather than duplicating it.

**Live** (`imp02-uat-topology-live.test.ts`, 8/8, gated on `TEST_TOPOLOGY_LIVE`): fail-loud canary throws if no fresh evidence directory was produced; asserts A3 transport failure, route-table corroboration, positive 401, A4 404, both forwarding sysctls, verdict/exit-code, and that the evidence never leaks the dummy token. The live test does not itself own VM lifecycle (`topology.sh up` must be run separately), though `run-a3.sh` does restart HAProxy for A4 — a minor deviation from the convention Turn A established of keeping service lifecycle entirely outside Vitest; recorded as a LOW finding below, not a correctness defect.

## 11. Canonical Regression — Independently Reproduced

Reproduced from a fresh scratch PostgreSQL 17.10 (not accepted from the implementer's report): all 70 migrations applied cleanly (head `070_fnd_rate_limit_policy_privilege_hardening`, no `071`), all 9 grant files applied cleanly.

| Gate | Result |
|---|---|
| TypeScript `tsc -b` | 0 errors |
| Full canonical, `--no-file-parallelism` | **189/191 files passed** (2 correctly self-skipped — the two env-gated live files), **5004/5035 tests passed, 31 skipped, 0 failures** |
| Skip reconciliation | 31 = 23 (Turn-A Tier-3, `TEST_EDGE_BASE_URL`) + 8 (Turn-B live, `TEST_TOPOLOGY_LIVE`) — exact |
| Migration head | `070` (70 migrations, unchanged) |
| Grants | all 9 byte-unchanged |

Reconciles exactly to the pre-Turn-B baseline (5003, per `IMP-02-ACC-001`) + 24 new Tier-1 + 8 new live = 5035.

---

## 12. Findings

Three new LOW, non-blocking findings are opened by this record, registered in `OPEN_FINDINGS.md` under the existing `IMP-02` section — none blocked Turn-B acceptance:

| Finding ID | Origin | Severity | Status | Summary |
|---|---|---|---|---|
| **IMP-02-FIND-005** | Independent review, this turn | LOW | OPEN | `run-a3.sh`'s `curl -o` response-body capture is not truncated before a failed probe, so a failed run's evidence file can retain a prior successful response body (independently reproduced: a `status: 000` positive-control failure recorded a stale `WLT1_AUTH_REQUIRED` body with an unchanged mtime from the prior run). Cannot produce a false PASS — the pass/fail gate reads the freshly-captured HTTP status code, never the body file — evidence-integrity/diagnostics only. |
| **IMP-02-FIND-006** | Independent review, this turn | LOW | OPEN | `lima.yaml`'s guest image is a floating Ubuntu 24.04 release pointer with no `digest:` field (Lima performs no image-integrity verification), and `topology.sh` accepts any `limactl` on PATH without asserting a version (2.2.0 is documented in `README.md` prose only). Bit-exact UAT reproducibility only — does not undermine the accepted network-isolation property, which is a stable kernel guarantee across 24.04 point releases. |
| **IMP-02-FIND-007** | Independent review, this turn | LOW | OPEN | Three test-architecture/assertion-strength observations: (1) the live Vitest test indirectly drives HAProxy restarts via `run-a3.sh`'s `child_process` invocation, a minor deviation from Turn A's established convention of keeping service lifecycle entirely outside Vitest; (2) the static no-TLS-claim assertion (`/TLS (is )?implemented|HTTPS production.ready/i`) is narrow and would not catch all possible TLS-implemented wording; (3) namespace-membership static assertions partly depend on the `v-pub-*`/`v-bck-*` veth naming convention rather than pure topology structure. No demonstrated correctness failure in any case. |

`IMP-02-FIND-001` through `IMP-02-FIND-004` (Turn A, LOW/OPEN) are preserved unchanged — this record neither closes nor worsens them. `FND-FIND-001` (HIGH, pre-authentication abuse) and `FND-FIND-010` (MEDIUM, IAM pool capacity gap) are reaffirmed unchanged, not solved by this work, and remain outstanding.

## 13. IMP-02 Overall Status

Acceptance of Turn B does not constitute IMP-02 completion. Unaffected and unresolved: TLS termination (pending); production numeric pre-authentication policy (NOT APPROVED — M1–M8 unmeasured, `U`/`N` unselected, A1–A10 not run at production shape — Turn B satisfies A3/A4 in the UAT harness only, not at production shape); production deployment of L2 isolation (Turn B proves the property only in a disposable UAT harness, not against any deployed topology); cloud provider and IaC tooling selection (still open); a named accountable human owner (`Unassigned`). **IMP-02 REMAINS IN_PROGRESS.**

## 14. FND-FIND-001 — Unaffected

Turn B does not close `FND-FIND-001`. Closure requires (per `IMP-02/README.md`'s own criteria, unchanged by this record): L1+L2 deployed with *approved production* numbers (not UAT provisionals) at a real deployed topology; the full A1–A10 matrix passed at production shape; a measured, documented bound on unauthenticated-traffic-attributable `iam.auth_event` writes; `FND-FIND-010`'s IAM pool configuration addressed; TLS termination; independent acceptance at a named commit against that production deployment; and the associated governance updates. **`FND-FIND-001` REMAINS HIGH/OPEN.**

## 15. Documentation Impact

This record, plus updates to `docs/03_implementation/IMP-02/README.md` (Turn B acceptance, updated status block, updated ownership table), `DECISION_LOG.md` (DEC-010's Status field annotated in place — no new decision entry, baseline commit unchanged), `DOCUMENT_REGISTER.md` (this record registered in §4b), `OPEN_FINDINGS.md` (IMP-02 section updated to record Turn B acceptance; `IMP-02-FIND-005` through `IMP-02-FIND-007` registered; `FND-FIND-001`/FND-01/WLT-01 section intros updated), `00_project_state/MODULE_STATUS.md` and `PROJECT_HANDOVER.md` (chronology), and `02_modules/WLT-01/README.md` / `02_modules/FND-01/README.md` (minimal cross-reference updates).

## 16. Final Statement

**IMP-02 TURN B — L2 UAT ISOLATION: COMPLETE / ACCEPTED (at `7132057`).**
**A3 (direct-bypass), positive control, and A4 (L3 regression): all independently reproduced PASS.**
**IMP-02-FIND-005 through IMP-02-FIND-007: OPEN (LOW, non-blocking).**
**IMP-02-FIND-001 through IMP-02-FIND-004 (Turn A): unchanged, OPEN (LOW, non-blocking).**
**TLS TERMINATION: REMAINS PENDING IMP-02 work — not implemented, not a Turn-B defect.**
**IMP-02 OVERALL: IN_PROGRESS — not complete.**
**FND-FIND-001: REMAINS HIGH/OPEN.** **FND-FIND-010: REMAINS OPEN.**
**PRODUCTION PRE-AUTH NUMERIC POLICY: NOT APPROVED.**
**PRODUCTION L2 NETWORK ISOLATION: NOT PROVEN — Turn B proves the property only inside a disposable UAT harness.**
**INTERNET EXPOSURE: REMAINS PROHIBITED.**
