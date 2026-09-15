# IMP-02 Turn C — UAT TLS Termination

**UAT TLS HARNESS ONLY. NOT PRODUCTION. NO PRODUCTION CERTIFICATE AUTHORITY. NO PRODUCTION
CIPHER POLICY. NO BACKEND TLS/mTLS. NO CLOUD TLS SERVICE.** This directory implements and proves
functional TLS termination at the DEC-010 L1 trusted edge, using the SAME accepted HAProxy
frontend Turn A built (`../haproxy.base.cfg` + `../uat/haproxy.limits.cfg`, loaded verbatim —
never duplicated or reimplemented) with a narrow, guarded, fail-closed modification to its single
`bind` directive. See the DEC-010 Turn C TLS architecture governance review for the full
adjudication of why this is the minimal viable change.

## What this is

A guarded two-branch `bind` in `../haproxy.base.cfg`:

```
.if defined(EDGE_TLS_ENABLED)
    bind "${EDGE_BIND_ADDR}:${EDGE_BIND_PORT}" ssl crt "${EDGE_TLS_CRT_PATH}" ssl-min-ver TLSv1.2
.else
    bind "${EDGE_BIND_ADDR}:${EDGE_BIND_PORT}"
.endif
```

**`EDGE_TLS_ENABLED` is a PRESENCE flag, not a boolean.** HAProxy's config preprocessor tests
whether a variable is *defined*, never its value's truthiness — empirically verified during Phase
0 that `EDGE_TLS_ENABLED=false` still selects the TLS branch identically to `EDGE_TLS_ENABLED=1`,
and still requires `EDGE_TLS_CRT_PATH` or fails closed. **To run Turn A's accepted HTTP-only
mode, UNSET `EDGE_TLS_ENABLED` entirely** — never set it to `"false"`, `"0"`, or any other
falsy-looking string.

This harness builds HAProxy 3.0.27 from the SAME governed source tarball/digest as Turns A and
B, with `TARGET=linux-glibc USE_OPENSSL=1`, inside the same disposable Lima Linux guest Turn B's
`uat-topology/` already established — TLS is proven exclusively inside that guest, never on the
macOS host (no usable OpenSSL development headers exist there). This harness never modifies
`uat-topology/lima.yaml` or `topology.sh`: `tls-verify.sh` installs `libssl-dev` guest-locally
and drives its own separate, TLS-enabled HAProxy process on **port 8443**, coexisting with (never
replacing or restarting) Turn B's own accepted plain-HTTP edge on port 8080.

## What this is not

Not a production certificate authority, service, or lifecycle (not AWS ACM, Azure Key Vault, GCP
Certificate Manager, Cloudflare, Let's Encrypt, or any commercial CA). Not a production cipher
policy (this harness relies on HAProxy/OpenSSL defaults constrained only by
`ssl-min-ver TLSv1.2`, and records the negotiated suite as evidence). Not backend/service-to-service
TLS or mTLS (`ns_edge -> ns_backend` remains plain HTTP, unchanged). Not a change to
`services/wlt1` or any migration/grant. Not a remediation of `IMP-02-FIND-001` through
`IMP-02-FIND-007` (carried forward, untouched here). Not M7 capacity/handshake-rate measurement —
this harness proves TLS is *functional*, never how fast it is.

## Prerequisites

Requires `../uat-topology/topology.sh up` to have already been run successfully (real WLT-01 and
Turn B's own plain-HTTP edge must already be up inside the Lima guest). See
`../uat-topology/README.md` for Lima acquisition.

## Running

```sh
cd platform/edge/uat-topology && ./topology.sh up   # if not already up
cd ../uat-tls
./tls-verify.sh
```

Or via the repository's npm entry point (thin wrapper, no new dependency):

```sh
npm run edge:tls:verify
```

`tls-verify.sh` owns the entire process lifecycle for this harness (installing `libssl-dev`,
building the TLS-capable binary, generating certificates, starting/stopping its own edge
instance) — a Vitest test file never spawns or manages a process here, matching the lesson
recorded as `IMP-02-FIND-007`.

## The frozen tests

**Certificate model (T1–T4).** T1: trusted UAT CA + correct hostname (`uat-edge.aix.invalid`,
via `--resolve`, never real DNS) → TLS handshake succeeds. T2: no CA trust → verification fails,
no HTTP response. T3: correct CA, but the presented certificate's SAN names a *different* host →
hostname verification fails. T4: correct CA and hostname, but the certificate's `notBefore`/
`notAfter` are both genuinely in the past (real CA-signed expiry, not a simulated flag) →
verification fails.

**Protocol policy (T5–T8).** Minimum TLS 1.2, TLS 1.3 enabled, TLS 1.0/1.1 rejected
(`ssl-min-ver TLSv1.2`). T5/T6 are preceded by a **non-vacuity baseline**: the exact client
invocation is first proven, against a deliberately permissive throwaway `openssl s_server`, to
genuinely *complete* a real TLS 1.0/1.1 handshake (`-cipher DEFAULT@SECLEVEL=0`) — a default
OpenSSL 3 client refuses to even attempt these protocols locally, which would otherwise produce a
vacuous PASS (the exact class of defect recorded as `IMP-02-FIND-001`). Only after that baseline
is confirmed does T5/T6 assert the REAL governed edge rejects the same client with a TLS
`protocol_version` alert.

**Application controls.** Through the real TLS edge, to real WLT-01, with no bearer:
`GET /wlt1/destinations` → `401 WLT1_AUTH_REQUIRED`, attributed via WLT's structured JSON
envelope (`x-request-id`/`x-correlation-id`) plus the edge's own injected
`Cache-Control: no-store`/`X-Content-Type-Options: nosniff` — proving the full
client → TLS edge → perimeter → real WLT path. With the edge deliberately injecting a wrong
perimeter token: real WLT's own unmodified L3 gate still returns `404 NOT_FOUND` (distinguished
from an edge-local 404 the same way Turn B distinguishes it); the valid token is restored
afterward.

**Regression.** The Turn-B A3 direct-bypass property (`ns_client` → WLT backend directly → no
HTTP response) is re-run unmodified — TLS addition must not, and structurally cannot, weaken L2.
A subset of the TLS-enabled perimeter (`/internal/*` denial, path-confusion rejection, spoofed
provenance-header stripping, the pre-handshake connection ceiling) is re-proven live over the TLS
listener.

## Certificate model

Locally generated, ephemeral, non-production: an ECDSA P-256 test CA (~30 day validity) signs
three ECDSA P-256 leaf certificates — `valid` (SAN `DNS:uat-edge.aix.invalid`, ~7 days),
`wrong-host` (SAN `DNS:wrong-host.aix.invalid`, same CA, valid dates), and `expired` (SAN
`DNS:uat-edge.aix.invalid`, genuinely expired). See `make-certs.sh`. The client trusts the test
CA explicitly via `--cacert` — it is never installed into any system trust store, on the guest or
the macOS host.

## Evidence

Each `tls-verify.sh` invocation writes a timestamped directory under `evidence/` (git-ignored —
only `evidence/.gitignore` is tracked): HAProxy `-vv` output and binary SHA-256, the actual
`libssl-dev`/runtime package identities, guest OS identity, certificate public metadata
(subject/SAN/dates/fingerprint — never a private key), the T1–T8 raw results, the HTTPS
positive-control and invalid-provenance results, the A3 regression result, and an overall
`verdict.txt`. Every evidence file is removed immediately before the probe that (re)writes it, so
a failed probe can never retain a prior run's content.

## Private keys and secrets

Generated entirely inside the disposable Lima guest by `make-certs.sh`, under `generated/`
(git-ignored — only `generated/.gitignore` is tracked). No private key or real certificate is
ever committed, logged, or written into evidence. The perimeter tokens used here follow Turn B's
convention: explicitly non-secret, labelled `NOT-A-REAL-SECRET`.

## Reversibility

`tls-verify.sh` stops only the TLS edge process it started (port 8443) — Turn B's own accepted
plain-HTTP edge (port 8080) is never touched. `../uat-topology/topology.sh destroy` removes the
entire guest, including everything this harness added to it.
