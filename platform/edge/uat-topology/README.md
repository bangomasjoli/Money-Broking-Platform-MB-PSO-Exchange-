# IMP-02 Turn B — L2 UAT Isolation Topology

**UAT TOPOLOGY HARNESS ONLY. NOT PRODUCTION. NO CLOUD-PROVIDER COMMITMENT. NO CONTAINER-PLATFORM
COMMITMENT.** This directory implements and proves `docs/DECISION_LOG.md` DEC-010's L2 invariant
("the WLT listener must not be directly internet-reachable") for the UAT reference edge accepted
in Turn A (`docs/03_implementation/IMP-02/acceptance/IMP-02_UAT_Trusted_Edge_Turn_A_Opus_Acceptance_v1.0.md`).
It selects no production virtualization, container, or cloud technology — see the DEC-010 Turn 2A
L2 topology-selection governance review for that adjudication.

## What this is

A single disposable Lima-managed Linux guest (`vmType: vz` — Apple's Virtualization.framework,
**no host root, no sudoers change, nothing installed on the macOS host**) containing three genuine
Linux network namespaces:

```
ns_client (10.80.0.2/24, net_public ONLY — no interface, no route to net_backend)
     |
  net_public (10.80.0.0/24)
     |
ns_edge (10.80.0.1/24 public side + 10.90.0.1/24 backend side — the ONLY namespace on both)
     |
  net_backend (10.90.0.0/24)
     |
ns_backend (10.90.0.2/24, net_backend ONLY)
```

`ns_edge` runs the **real, unmodified** Turn-A HAProxy 3.0.27 config
(`../haproxy.base.cfg` + `../uat/haproxy.limits.cfg`, loaded verbatim, copied fresh from the
working tree at run time — never duplicated or reimplemented in this directory). `ns_backend`
runs the **real, unmodified** `services/wlt1`. Isolation is enforced by the guest kernel's own
namespace boundary: `ns_client` has no interface, no route, and no membership on `net_backend` —
an architectural absence of reachability, not a filter layered on top of shared reachability.

## What this is not

Not TLS (Turn A's edge remains TLS-neutral by design — see `../README.md`'s "TLS Status"). Not a
production network topology, firewall, or security-group configuration. Not a change to
`services/wlt1`, `services/fnd`, `services/iam`, any migration, or any grant — Turn B consumes
those unmodified. Not a remediation of `IMP-02-FIND-001` through `IMP-02-FIND-004` (Turn-A
carry-forwards, untouched here).

## Prerequisites

**Lima is required and is NOT installed by this repository.** Obtain and verify it yourself:

```sh
VER=2.2.0
curl -fsSLO "https://github.com/lima-vm/lima/releases/download/v$VER/lima-$VER-Darwin-arm64.tar.gz"
curl -fsSLO "https://github.com/lima-vm/lima/releases/download/v$VER/SHA256SUMS"
grep "lima-$VER-Darwin-arm64.tar.gz\$" SHA256SUMS | shasum -a 256 -c -
mkdir -p /path/to/lima && tar xzf "lima-$VER-Darwin-arm64.tar.gz" -C /path/to/lima
export PATH="/path/to/lima/bin:$PATH"   # session-local only — nothing is installed system-wide
```

Requires macOS 13.5+ with `kern.hv_support = 1` (`sysctl kern.hv_support`). No Docker, Podman,
Colima, or any other container/VM tooling is required or used.

## Running

```sh
cd platform/edge/uat-topology
./topology.sh up          # starts the guest, builds HAProxy + prepares WLT, wires the topology
./run-a3.sh                # runs A3 (negative), the positive control, and A4 — prints PASS/FAIL
./topology.sh status       # inspect namespace/route/forwarding state at any time
./topology.sh down         # stop the guest (topology + services destroyed with it)
./topology.sh destroy      # stop AND delete the guest entirely — full reversal, nothing left
```

Or via the repository's npm entry point (thin wrapper, no new dependency):

```sh
npm run edge:topology:verify
```

## The three frozen tests (`run-a3.sh`)

1. **A3 (negative, direct bypass).** From `ns_client`, a direct request to the WLT backend
   address:port. **PASS** requires a transport-layer failure only (`curl` reporting `000` — no
   HTTP response at all). **Any** HTTP status — including WLT's own `404`— is a **FAIL**, because
   it proves WLT was reachable.
2. **Positive control.** From the same `ns_client`, through the edge, to `/wlt1/destinations`.
   Expected: `401 WLT1_AUTH_REQUIRED` — proves the environment genuinely works end-to-end (edge
   admits the path, injects the trusted perimeter token, WLT's L3 gate admits it, WLT's own auth
   chain rejects the absent bearer). **A3 is never reported PASS unless this also passes** — an
   isolated-but-broken network must not be mistaken for a successful proof.
3. **A4 (L3 regression).** The edge is restarted with a deliberately **wrong** dummy perimeter
   token (via a runtime environment variable only — `services/wlt1` and `haproxy.base.cfg` are
   never touched). Expected: `404` — WLT's existing, unmodified L3 gate still rejects invalid
   provenance through the isolated topology. The edge is then restored to the valid token.

## Evidence

Each `run-a3.sh` invocation writes a timestamped directory under `evidence/` (git-ignored — only
`evidence/.gitignore` is tracked) containing: `namespace-membership.txt` (`ip netns list`,
per-namespace `addr`/`route`, and `ns_edge`'s forwarding sysctls — the direct proof of
non-membership), `version-inventory.txt` (Lima, guest kernel, HAProxy, Node versions — no
credentials), `a3-direct-bypass.txt`, `positive-control.txt`, `a4-l3-regression.txt`, and
`summary.txt`/`verdict.txt`. No real secret ever appears in evidence — the harness uses an
explicitly-named dummy token (`turnb-topology-dummy-token-NOT-A-REAL-SECRET-…`), never a real
operational credential.

## Reversibility

`./topology.sh destroy` stops and deletes the Lima guest entirely. Nothing is ever written outside
the guest's own directory tree and this repository's `evidence/` folder (git-ignored); no macOS
host file, launch agent, firewall rule, route, or sudoers entry is ever created.
