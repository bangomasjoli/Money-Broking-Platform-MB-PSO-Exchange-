#!/usr/bin/env bash
# IMP-02 Turn B — A3 direct-bypass proof, positive control, and A4 L3 regression.
#
# UAT TOPOLOGY HARNESS ONLY. Requires topology.sh up to have already been run successfully.
#
# Frozen acceptance criteria (see the DEC-010 Turn 2A L2 topology-selection review):
#   A3 (negative):  ns_client -> WLT backend address:port DIRECTLY -> MUST fail at transport/
#                    network layer. ANY HTTP response (curl reporting a numeric status, including
#                    404/401/403/429/5xx) is a FAIL, because it proves WLT was reachable.
#   Positive control: ns_client -> HAProxy public address -> /wlt1/destinations -> MUST return 401
#                    (WLT1_AUTH_REQUIRED) — proves client -> edge -> real WLT traversal works, so
#                    the A3 failure above is topology isolation, not a broken harness.
#   A4 (L3 regression): with the edge deliberately injecting a WRONG perimeter token, the same
#                    request through the edge -> MUST return 404 (WLT's own L3 gate rejecting
#                    invalid provenance, unmodified, working through the isolated topology).
#
# A3 is reported PASS only if the positive control also passes in the same run — an isolated
# network with no working edge path would trivially "pass" A3 for the wrong reason, and that must
# never be reported as a successful proof.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_NAME="${IMP02_TOPOLOGY_INSTANCE:-imp02-topology}"
LIMACTL="${LIMACTL:-limactl}"
EVIDENCE_DIR="$HERE/evidence/$(date -u +%Y%m%dT%H%M%SZ)"
NET_BACKEND_WLT_ADDR="10.90.0.2"
NET_PUBLIC_EDGE_ADDR="10.80.0.1"
WLT_PORT="8090"
EDGE_PORT="8080"

mkdir -p "$EVIDENCE_DIR"
log() { printf '[run-a3] %s\n' "$*" | tee -a "$EVIDENCE_DIR/summary.txt" >&2; }

gsh() { "$LIMACTL" shell "$INSTANCE_NAME" -- "$@"; }
# ip netns exec (and, on some iproute2 versions, ip -n <ns> ...) requires root (CAP_SYS_ADMIN) —
# every command touching a namespace below MUST go through gsudo, never plain gsh, or the check
# silently fails with a permission error regardless of the real namespace/service state (this
# exact bug was caught live during IMP-02 Turn B implementation — see the acceptance record).
gsudo() { "$LIMACTL" shell "$INSTANCE_NAME" -- sudo "$@"; }

overall_pass=true

# ---- Membership evidence (captured regardless of test outcome) ----------------------------------
log "capturing namespace membership evidence"
gsudo bash -c '
  echo "=== ip netns list ==="; ip netns list
  for ns in ns_client ns_edge ns_backend; do
    echo "=== $ns addr ==="; ip -n $ns addr show 2>/dev/null
    echo "=== $ns route ==="; ip -n $ns route show 2>/dev/null
  done
  echo "=== ns_edge forwarding state ==="
  ip netns exec ns_edge sysctl net.ipv4.ip_forward net.ipv6.conf.all.forwarding 2>/dev/null
' > "$EVIDENCE_DIR/namespace-membership.txt" 2>&1
grep -q "10.90.0" "$EVIDENCE_DIR/namespace-membership.txt" && \
  ! grep -A5 "=== ns_client route ===" "$EVIDENCE_DIR/namespace-membership.txt" | grep -q "10.90.0" && \
  log "membership evidence: ns_client route table does NOT contain 10.90.0.0/24 (expected)" || \
  log "membership evidence captured (see namespace-membership.txt for full detail)"

# ---- Version evidence ---------------------------------------------------------------------------
gsh bash -c '
  echo "=== limactl / guest ==="; uname -a
  echo "=== node ==="; node --version 2>/dev/null || true
  echo "=== haproxy ==="; ~lima/haproxy-build/haproxy-3.0.27/haproxy -v 2>/dev/null || true
' > "$EVIDENCE_DIR/version-inventory.txt" 2>&1
"$LIMACTL" --version >> "$EVIDENCE_DIR/version-inventory.txt" 2>&1 || true

# ---- A3: direct bypass (negative) ---------------------------------------------------------------
log "A3: ns_client -> WLT backend directly ($NET_BACKEND_WLT_ADDR:$WLT_PORT)"
a3_raw="$(gsudo bash -c "ip netns exec ns_client curl -s -o /tmp/a3-body.txt -w '%{http_code} exit=%{exitcode}' --max-time 3 http://$NET_BACKEND_WLT_ADDR:$WLT_PORT/wlt1/destinations 2>&1" || true)"
echo "$a3_raw" > "$EVIDENCE_DIR/a3-direct-bypass.txt"
a3_status="$(echo "$a3_raw" | grep -oE '^[0-9]{3}' || echo '???')"
log "A3 raw result: $a3_raw"

if [ "$a3_status" = "000" ]; then
  log "A3: PASS — no HTTP response obtained (transport-layer failure, as required)"
else
  log "A3: FAIL — an HTTP response (status=$a3_status) was obtained; WLT was directly reachable"
  overall_pass=false
fi

# ---- Positive control: ns_client -> edge -> WLT --------------------------------------------------
log "positive control: ns_client -> HAProxy edge ($NET_PUBLIC_EDGE_ADDR:$EDGE_PORT) -> /wlt1/destinations"
pos_raw="$(gsudo bash -c "ip netns exec ns_client curl -s -o /tmp/pos-body.txt -w '%{http_code}' --max-time 5 http://$NET_PUBLIC_EDGE_ADDR:$EDGE_PORT/wlt1/destinations 2>&1" || true)"
pos_body="$(gsh bash -c 'cat /tmp/pos-body.txt 2>/dev/null' || true)"
{ echo "status: $pos_raw"; echo "body: $pos_body"; } > "$EVIDENCE_DIR/positive-control.txt"
log "positive control result: status=$pos_raw body=$pos_body"

positive_pass=false
if [ "$pos_raw" = "401" ] && echo "$pos_body" | grep -q "WLT1_AUTH_REQUIRED"; then
  positive_pass=true
  log "positive control: PASS — 401 WLT1_AUTH_REQUIRED (client -> edge -> real WLT confirmed working)"
else
  log "positive control: FAIL — expected 401/WLT1_AUTH_REQUIRED, got status=$pos_raw"
  overall_pass=false
fi

# A3 is only meaningful together with a working positive control — never report A3 PASS alone.
if [ "$a3_status" = "000" ] && [ "$positive_pass" != "true" ]; then
  log "A3 verdict WITHHELD: direct bypass failed, but the positive control ALSO failed — the topology itself may be broken, not isolating. Overall result is FAIL."
  overall_pass=false
fi

# ---- A4: L3 regression through the isolated topology ---------------------------------------------
log "A4: restarting edge with a deliberately WRONG perimeter token"
"$HERE/topology.sh" edge-wrong-token > "$EVIDENCE_DIR/a4-edge-restart.log" 2>&1
a4_raw="$(gsudo bash -c "ip netns exec ns_client curl -s -o /tmp/a4-body.txt -w '%{http_code}' --max-time 5 http://$NET_PUBLIC_EDGE_ADDR:$EDGE_PORT/wlt1/destinations 2>&1" || true)"
echo "status: $a4_raw" > "$EVIDENCE_DIR/a4-l3-regression.txt"
log "A4 result: status=$a4_raw"

if [ "$a4_raw" = "404" ]; then
  log "A4: PASS — WLT's L3 gate rejects invalid provenance (404) through the isolated topology"
else
  log "A4: FAIL — expected 404, got status=$a4_raw"
  overall_pass=false
fi

log "restoring edge to the valid perimeter token"
"$HERE/topology.sh" edge-valid-token >> "$EVIDENCE_DIR/a4-edge-restart.log" 2>&1

# ---- Verdict --------------------------------------------------------------------------------------
if [ "$overall_pass" = "true" ]; then
  log "OVERALL: PASS — A3 negative, positive control, and A4 all satisfied their frozen criteria"
  echo "PASS" > "$EVIDENCE_DIR/verdict.txt"
  exit 0
else
  log "OVERALL: FAIL — see summary.txt and the individual evidence files above"
  echo "FAIL" > "$EVIDENCE_DIR/verdict.txt"
  exit 1
fi
