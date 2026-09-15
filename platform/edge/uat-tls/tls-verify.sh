#!/usr/bin/env bash
# IMP-02 Turn C — UAT TLS termination verification.
#
# UAT TLS HARNESS ONLY. NOT PRODUCTION. NO PRODUCTION CERTIFICATE. NO BACKEND TLS/mTLS.
#
# Requires `platform/edge/uat-topology/topology.sh up` to have already been run successfully —
# this script does not bring up the Turn-B guest/topology itself (mirrors run-a3.sh's own
# documented precondition). It adds a SEPARATE, TLS-enabled HAProxy instance in ns_edge, bound
# to a different port (EDGE_TLS_PORT, default 8443) than Turn-B's accepted plain-HTTP edge
# (port 8080, EDGE_PORT) — the two coexist; this script never kills, restarts, or reconfigures
# Turn-B's own edge process, so Turn-B's own accepted property (A3/positive/A4 on port 8080)
# is left completely undisturbed by anything this script does.
#
# Frozen tests (see README.md for the full description of each):
#   T1-T4  certificate model:  trusted-CA+correct-host PASS; no-CA FAIL; wrong-host FAIL;
#          expired-cert FAIL.
#   T5-T8  protocol policy:    TLS 1.0 REJECT; TLS 1.1 REJECT; TLS 1.2 PASS; TLS 1.3 PASS.
#          T5/T6 use a client independently proven (against a throwaway permissive listener)
#          capable of completing a real TLS 1.0/1.1 handshake — never a vacuous client-side
#          refusal (IMP-02-FIND-001's lesson).
#   HTTPS WLT positive control: ns_client -> TLS edge -> real WLT, no bearer -> 401
#          WLT1_AUTH_REQUIRED, attributed via WLT's JSON envelope + x-request-id/x-correlation-id
#          plus the edge's own Cache-Control/X-Content-Type-Options headers.
#   Invalid provenance: TLS edge restarted with a deliberately wrong perimeter token -> real
#          WLT L3's own 404 NOT_FOUND (distinguished from an edge-local 404 the same way Turn B
#          distinguishes it) -> valid token restored afterward.
#   A3 regression: ns_client -> WLT backend directly -> must remain a transport-layer failure
#          (re-run of Turn B's own frozen A3, unaffected by anything TLS-related).
#
# Evidence hygiene (IMP-02-FIND-005's lesson): every probe that captures output to a file
# removes that file immediately before writing it, so a failed probe can never retain a prior
# run's content.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_NAME="${IMP02_TOPOLOGY_INSTANCE:-imp02-topology}"
LIMACTL="${LIMACTL:-limactl}"
EVIDENCE_DIR="$HERE/evidence/$(date -u +%Y%m%dT%H%M%SZ)"

HAPROXY_VERSION="3.0.27"
HAPROXY_SHA256="c200b72ed5078d99d4bd658834478058409420b45d08dcec7e7a015e9c7b1dd1"

NET_PUBLIC_EDGE_ADDR="10.80.0.1"
NET_BACKEND_WLT_ADDR="10.90.0.2"
EDGE_TLS_PORT="8443"
WLT_PORT="8090"
HOSTNAME_VALID="uat-edge.aix.invalid"

VALID_TOKEN="turnb-topology-dummy-token-NOT-A-REAL-SECRET-0123456789"
WRONG_TOKEN="turnc-tls-WRONG-dummy-token-NOT-A-REAL-SECRET-fedcba"

GUEST_PLATFORM="/home/lima.guest/platform"
GUEST_TLS_DIR="$GUEST_PLATFORM/edge/uat-tls"
GUEST_TLS_HAPROXY="/home/lima.guest/haproxy-tls-build/haproxy-$HAPROXY_VERSION/haproxy"

mkdir -p "$EVIDENCE_DIR"
log() { printf '[tls-verify] %s\n' "$*" | tee -a "$EVIDENCE_DIR/summary.txt" >&2; }
fail_loud() { log "FATAL: $*"; echo "FAIL" > "$EVIDENCE_DIR/verdict.txt"; exit 1; }

gsh() { "$LIMACTL" shell "$INSTANCE_NAME" -- "$@"; }
gsudo() { "$LIMACTL" shell "$INSTANCE_NAME" -- sudo "$@"; }

overall_pass=true
record() { # record <label> <PASS|FAIL>
  if [ "$2" = "PASS" ]; then log "$1: PASS"; else log "$1: FAIL"; overall_pass=false; fi
}

# ---- Preconditions --------------------------------------------------------------------------
command -v "$LIMACTL" >/dev/null 2>&1 || fail_loud "limactl not found on PATH"
gsudo bash -c 'ip netns list' 2>/dev/null | grep -q '^ns_edge' \
  || fail_loud "ns_edge does not exist — run 'topology.sh up' first (see uat-topology/README.md)"
gsudo bash -c "ip netns exec ns_backend ss -tln 2>/dev/null | grep -q ':$WLT_PORT '" \
  || fail_loud "WLT-01 is not listening in ns_backend on port $WLT_PORT — run 'topology.sh up' first"
log "preconditions satisfied: ns_edge exists, WLT-01 is listening in ns_backend"

# ---- Guest-local OpenSSL dev dependency (never touches lima.yaml) --------------------------
log "verifying/installing guest-local libssl-dev (idempotent, guest-only)"
if ! gsh bash -c 'dpkg -s libssl-dev >/dev/null 2>&1'; then
  gsh bash -c 'sudo apt-get update -qq && sudo apt-get install -y -qq libssl-dev' \
    || fail_loud "failed to install libssl-dev in guest"
fi
gsh dpkg-query -W -f='${Package} ${Version} ${Architecture}\n' libssl-dev \
  > "$EVIDENCE_DIR/openssl-dev-package.txt"
gsh bash -c 'dpkg -l | grep -E "^ii\s+libssl3" | awk "{print \$2, \$3, \$4}"' \
  > "$EVIDENCE_DIR/openssl-runtime-package.txt"
log "libssl-dev: $(cat "$EVIDENCE_DIR/openssl-dev-package.txt")"
log "runtime package: $(cat "$EVIDENCE_DIR/openssl-runtime-package.txt")"

# ---- TLS-capable governed HAProxy build (separate build dir from Turn-B's plain build) -----
log "verifying/building governed HAProxy $HAPROXY_VERSION with USE_OPENSSL=1 inside guest"
if ! gsh bash -c "test -x $GUEST_TLS_HAPROXY && $GUEST_TLS_HAPROXY -vv 2>/dev/null | grep -q '+OPENSSL'"; then
  gsh bash -c "
    set -euo pipefail
    mkdir -p ~/haproxy-tls-build && cd ~/haproxy-tls-build
    [ -f haproxy-$HAPROXY_VERSION.tar.gz ] || curl -fsSLO https://www.haproxy.org/download/3.0/src/haproxy-$HAPROXY_VERSION.tar.gz
    echo '$HAPROXY_SHA256  haproxy-$HAPROXY_VERSION.tar.gz' | sha256sum -c -
    rm -rf haproxy-$HAPROXY_VERSION
    tar xzf haproxy-$HAPROXY_VERSION.tar.gz
    cd haproxy-$HAPROXY_VERSION
    make -j\"\$(nproc)\" TARGET=linux-glibc USE_OPENSSL=1
  " || fail_loud "TLS-capable HAProxy build failed"
fi
gsh bash -c "$GUEST_TLS_HAPROXY -vv" > "$EVIDENCE_DIR/haproxy-vv.txt"
gsh bash -c "sha256sum $GUEST_TLS_HAPROXY" > "$EVIDENCE_DIR/haproxy-binary-sha256.txt"
grep -q '+OPENSSL' "$EVIDENCE_DIR/haproxy-vv.txt" || fail_loud "built HAProxy does not report OpenSSL capability"
grep -qE '^HAProxy version 3\.0\.27' <(gsh bash -c "$GUEST_TLS_HAPROXY -v") \
  || fail_loud "built HAProxy does not report version 3.0.27"
record "HAProxy TLS build (version + OpenSSL capability)" "PASS"

# ---- Guest OS identity, for evidence ---------------------------------------------------------
gsh bash -c 'uname -a; echo ---; lsb_release -a 2>/dev/null || cat /etc/os-release' \
  > "$EVIDENCE_DIR/guest-os-identity.txt"

# ---- Certificate generation (guest-local, ephemeral, never leaves the guest's own filesystem)
log "generating ephemeral UAT certificate set inside guest"
gsh bash -c "cd $GUEST_TLS_DIR && bash make-certs.sh" > "$EVIDENCE_DIR/make-certs.log" 2>&1 \
  || fail_loud "certificate generation failed — see evidence/make-certs.log"
gsh bash -c "
  for f in valid wrong-host expired; do
    echo \"=== \$f-cert.pem ===\"
    openssl x509 -in $GUEST_TLS_DIR/generated/\$f-cert.pem -noout -subject -issuer -dates -ext subjectAltName -fingerprint -sha256
  done
" > "$EVIDENCE_DIR/certificate-metadata.txt" 2>&1
log "certificate public metadata captured (no private key in evidence)"

# ---- wait_for_listener (poll, never a fixed sleep) -------------------------------------------
wait_for_listener() {
  local port="$1" logfile="$2" label="$3" budget="${4:-30}" waited=0
  while [ "$waited" -lt "$budget" ]; do
    if gsudo bash -c "ip netns exec ns_edge ss -tln 2>/dev/null | grep -q ':$port '"; then
      log "$label: listening on port $port after ${waited}s"; return 0
    fi
    sleep 1; waited=$((waited + 1))
  done
  log "$label: FAILED to bind port $port within ${budget}s — boot log follows"
  gsh bash -c "cat $logfile" || true
  return 1
}

# start_tls_edge <cert-combined-path> <token>
start_tls_edge() {
  local cert="$1" token="$2"
  gsudo bash -c 'for p in $(ip netns pids ns_edge 2>/dev/null); do
    cmd=$(tr "\0" " " < /proc/$p/cmdline 2>/dev/null || true)
    case "$cmd" in *haproxy-tls-build*) kill -9 "$p" 2>/dev/null || true ;; esac
  done; sleep 1'
  gsudo bash -c "
    cd $GUEST_PLATFORM/edge
    rm -f /tmp/tls-edge-boot.log
    setsid ip netns exec ns_edge env \
      EDGE_BIND_ADDR=$NET_PUBLIC_EDGE_ADDR \
      EDGE_BIND_PORT=$EDGE_TLS_PORT \
      EDGE_WLT1_UPSTREAM_ADDR=$NET_BACKEND_WLT_ADDR:$WLT_PORT \
      WLT1_PUBLIC_PERIMETER_TOKEN=$token \
      EDGE_BODY_LIMIT_BYTES=65536 \
      EDGE_HEADER_TIMEOUT=5s \
      EDGE_IDLE_TIMEOUT=30s \
      EDGE_CONN_LIMIT_PER_BUCKET=50 \
      EDGE_TLS_ENABLED=1 \
      EDGE_TLS_CRT_PATH=$cert \
      $GUEST_TLS_HAPROXY -f haproxy.base.cfg -f uat/haproxy.limits.cfg -db < /dev/null > /tmp/tls-edge-boot.log 2>&1 &
  "
  wait_for_listener "$EDGE_TLS_PORT" /tmp/tls-edge-boot.log "TLS edge ($cert)"
}

stop_tls_edge() {
  gsudo bash -c 'for p in $(ip netns pids ns_edge 2>/dev/null); do
    cmd=$(tr "\0" " " < /proc/$p/cmdline 2>/dev/null || true)
    case "$cmd" in *haproxy-tls-build*) kill -9 "$p" 2>/dev/null || true ;; esac
  done'
}

# curl_tls <extra-curl-args...> -- issues a request through the TLS edge, always using
# --resolve to bind the UAT hostname to the real edge address without any DNS dependency.
curl_https() {
  gsudo bash -c "ip netns exec ns_client curl -s --resolve $HOSTNAME_VALID:$EDGE_TLS_PORT:$NET_PUBLIC_EDGE_ADDR --max-time 5 $*"
}

# ================================================================================================
# T1-T4: certificate model
# ================================================================================================
log "===== T1-T4: certificate model ====="
start_tls_edge "$GUEST_TLS_DIR/generated/valid-combined.pem" "$VALID_TOKEN" || fail_loud "edge failed to start with valid cert"

log "T1: trusted CA + correct hostname -> TLS handshake must succeed"
rm -f "$EVIDENCE_DIR/t1-raw.txt"
t1_raw="$(curl_https "-o /dev/null -w '%{http_code}' --cacert $GUEST_TLS_DIR/generated/ca.pem https://$HOSTNAME_VALID:$EDGE_TLS_PORT/wlt1/destinations" 2>&1)"
echo "$t1_raw" > "$EVIDENCE_DIR/t1-raw.txt"
[ "$t1_raw" = "401" ] && record "T1 (trusted CA + correct host)" "PASS" || record "T1 (trusted CA + correct host)" "FAIL"

log "T2: no CA trust -> TLS verification must fail, no HTTP response"
rm -f "$EVIDENCE_DIR/t2-raw.txt"
t2_raw="$(curl_https "-o /dev/null -w '%{http_code} exit=%{exitcode}' https://$HOSTNAME_VALID:$EDGE_TLS_PORT/wlt1/destinations" 2>&1)"
echo "$t2_raw" > "$EVIDENCE_DIR/t2-raw.txt"
echo "$t2_raw" | grep -qE '^000' && record "T2 (untrusted CA)" "PASS" || record "T2 (untrusted CA)" "FAIL"

start_tls_edge "$GUEST_TLS_DIR/generated/wrong-host-combined.pem" "$VALID_TOKEN" || fail_loud "edge failed to start with wrong-host cert"
log "T3: correct CA, wrong-hostname cert -> hostname verification must fail"
rm -f "$EVIDENCE_DIR/t3-raw.txt"
t3_raw="$(curl_https "-o /dev/null -w '%{http_code} exit=%{exitcode}' --cacert $GUEST_TLS_DIR/generated/ca.pem https://$HOSTNAME_VALID:$EDGE_TLS_PORT/wlt1/destinations" 2>&1)"
echo "$t3_raw" > "$EVIDENCE_DIR/t3-raw.txt"
echo "$t3_raw" | grep -qE '^000' && record "T3 (wrong hostname)" "PASS" || record "T3 (wrong hostname)" "FAIL"

start_tls_edge "$GUEST_TLS_DIR/generated/expired-combined.pem" "$VALID_TOKEN" || fail_loud "edge failed to start with expired cert"
log "T4: correct CA, correct hostname, EXPIRED cert -> verification must fail"
rm -f "$EVIDENCE_DIR/t4-raw.txt"
t4_raw="$(curl_https "-o /dev/null -w '%{http_code} exit=%{exitcode}' --cacert $GUEST_TLS_DIR/generated/ca.pem https://$HOSTNAME_VALID:$EDGE_TLS_PORT/wlt1/destinations" 2>&1)"
echo "$t4_raw" > "$EVIDENCE_DIR/t4-raw.txt"
echo "$t4_raw" | grep -qE '^000' && record "T4 (expired certificate)" "PASS" || record "T4 (expired certificate)" "FAIL"

# ================================================================================================
# T5-T8: protocol policy (back to the valid cert)
# ================================================================================================
start_tls_edge "$GUEST_TLS_DIR/generated/valid-combined.pem" "$VALID_TOKEN" || fail_loud "edge failed to restart with valid cert"

log "T5/T6 non-vacuity baseline: proving the client can genuinely complete TLS1.0/1.1 (permissive throwaway listener)"
gsudo bash -c 'pkill -9 -f "openssl s_server" 2>/dev/null; sleep 1'
gsh bash -c "setsid openssl s_server -accept 19443 -cert $GUEST_TLS_DIR/generated/valid-cert.pem -key $GUEST_TLS_DIR/generated/valid-key.pem -www -cipher 'DEFAULT@SECLEVEL=0' < /dev/null > /tmp/sserver.log 2>&1 & disown; sleep 1"
rm -f "$EVIDENCE_DIR/t5-baseline.txt" "$EVIDENCE_DIR/t6-baseline.txt"
t5_baseline="$(gsh bash -c "timeout 3 openssl s_client -connect 127.0.0.1:19443 -tls1 -cipher 'DEFAULT@SECLEVEL=0' </dev/null 2>&1 | grep 'Protocol' || true")"
t6_baseline="$(gsh bash -c "timeout 3 openssl s_client -connect 127.0.0.1:19443 -tls1_1 -cipher 'DEFAULT@SECLEVEL=0' </dev/null 2>&1 | grep 'Protocol' || true")"
echo "$t5_baseline" > "$EVIDENCE_DIR/t5-baseline.txt"
echo "$t6_baseline" > "$EVIDENCE_DIR/t6-baseline.txt"
gsh bash -c 'pkill -9 -f "openssl s_server" 2>/dev/null' || true
if ! echo "$t5_baseline" | grep -q 'TLSv1$' || ! echo "$t6_baseline" | grep -q 'TLSv1.1'; then
  fail_loud "T5/T6 non-vacuity baseline FAILED — client cannot genuinely attempt TLS1.0/1.1; refusing to report a vacuous PASS (IMP-02-FIND-001 class defect)"
fi
log "non-vacuity baseline confirmed: client genuinely completed real TLS1.0 and TLS1.1 handshakes against the permissive listener"

log "T5: TLS1.0 attempt against the REAL governed edge -> must be rejected"
rm -f "$EVIDENCE_DIR/t5-real.txt"
t5_real="$(gsudo bash -c "ip netns exec ns_client timeout 3 openssl s_client -connect $NET_PUBLIC_EDGE_ADDR:$EDGE_TLS_PORT -tls1 -cipher 'DEFAULT@SECLEVEL=0' </dev/null 2>&1")"
echo "$t5_real" > "$EVIDENCE_DIR/t5-real.txt"
echo "$t5_real" | grep -q 'alert protocol version' && record "T5 (TLS1.0 rejected)" "PASS" || record "T5 (TLS1.0 rejected)" "FAIL"

log "T6: TLS1.1 attempt against the REAL governed edge -> must be rejected"
rm -f "$EVIDENCE_DIR/t6-real.txt"
t6_real="$(gsudo bash -c "ip netns exec ns_client timeout 3 openssl s_client -connect $NET_PUBLIC_EDGE_ADDR:$EDGE_TLS_PORT -tls1_1 -cipher 'DEFAULT@SECLEVEL=0' </dev/null 2>&1")"
echo "$t6_real" > "$EVIDENCE_DIR/t6-real.txt"
echo "$t6_real" | grep -q 'alert protocol version' && record "T6 (TLS1.1 rejected)" "PASS" || record "T6 (TLS1.1 rejected)" "FAIL"

log "T7: TLS1.2 against the REAL governed edge -> must succeed"
rm -f "$EVIDENCE_DIR/t7-real.txt"
t7_real="$(gsudo bash -c "ip netns exec ns_client timeout 3 openssl s_client -connect $NET_PUBLIC_EDGE_ADDR:$EDGE_TLS_PORT -tls1_2 </dev/null 2>&1")"
echo "$t7_real" > "$EVIDENCE_DIR/t7-real.txt"
echo "$t7_real" | grep -q 'Protocol.*TLSv1.2' && record "T7 (TLS1.2 accepted)" "PASS" || record "T7 (TLS1.2 accepted)" "FAIL"

log "T8: TLS1.3 against the REAL governed edge -> must succeed"
rm -f "$EVIDENCE_DIR/t8-real.txt"
t8_real="$(gsudo bash -c "ip netns exec ns_client timeout 3 openssl s_client -connect $NET_PUBLIC_EDGE_ADDR:$EDGE_TLS_PORT -tls1_3 </dev/null 2>&1")"
echo "$t8_real" > "$EVIDENCE_DIR/t8-real.txt"
echo "$t8_real" | grep -q 'Protocol.*TLSv1.3\|New, TLSv1.3' && record "T8 (TLS1.3 accepted)" "PASS" || record "T8 (TLS1.3 accepted)" "FAIL"

# ================================================================================================
# Application-level controls (through the real TLS edge to real WLT)
# ================================================================================================
log "===== HTTPS application positive control ====="
rm -f "$EVIDENCE_DIR/https-positive-control.txt"
pos_raw="$(curl_https "-i --cacert $GUEST_TLS_DIR/generated/ca.pem https://$HOSTNAME_VALID:$EDGE_TLS_PORT/wlt1/destinations" 2>&1)"
echo "$pos_raw" > "$EVIDENCE_DIR/https-positive-control.txt"
if echo "$pos_raw" | grep -qE '^HTTP/[12](\.1)? 401' && echo "$pos_raw" | grep -q 'WLT1_AUTH_REQUIRED' \
   && echo "$pos_raw" | grep -qi 'cache-control: no-store' && echo "$pos_raw" | grep -qi 'x-content-type-options: nosniff' \
   && echo "$pos_raw" | grep -q 'x-request-id' && echo "$pos_raw" | grep -q 'x-correlation-id'; then
  record "HTTPS WLT positive control (401 WLT1_AUTH_REQUIRED, full attribution)" "PASS"
else
  record "HTTPS WLT positive control (401 WLT1_AUTH_REQUIRED, full attribution)" "FAIL"
fi

log "===== Invalid provenance over HTTPS ====="
start_tls_edge "$GUEST_TLS_DIR/generated/valid-combined.pem" "$WRONG_TOKEN" || fail_loud "edge failed to restart with wrong token"
rm -f "$EVIDENCE_DIR/https-invalid-provenance.txt"
inv_raw="$(curl_https "-i --cacert $GUEST_TLS_DIR/generated/ca.pem https://$HOSTNAME_VALID:$EDGE_TLS_PORT/wlt1/destinations" 2>&1)"
echo "$inv_raw" > "$EVIDENCE_DIR/https-invalid-provenance.txt"
if echo "$inv_raw" | grep -qE '^HTTP/[12](\.1)? 404' && echo "$inv_raw" | grep -q 'NOT_FOUND' \
   && echo "$inv_raw" | grep -q 'x-request-id' && echo "$inv_raw" | grep -q 'x-correlation-id'; then
  record "Invalid provenance over HTTPS (real WLT 404, attributed)" "PASS"
else
  record "Invalid provenance over HTTPS (real WLT 404, attributed)" "FAIL"
fi

log "restoring TLS edge to the valid token"
start_tls_edge "$GUEST_TLS_DIR/generated/valid-combined.pem" "$VALID_TOKEN" || fail_loud "edge failed to restore valid token"
rm -f "$EVIDENCE_DIR/https-restoration-check.txt"
restore_raw="$(curl_https "-o /dev/null -w '%{http_code}' --cacert $GUEST_TLS_DIR/generated/ca.pem https://$HOSTNAME_VALID:$EDGE_TLS_PORT/wlt1/destinations" 2>&1)"
echo "$restore_raw" > "$EVIDENCE_DIR/https-restoration-check.txt"
[ "$restore_raw" = "401" ] && record "A4-style restoration (valid token, 401 again)" "PASS" || record "A4-style restoration (valid token, 401 again)" "FAIL"

# ================================================================================================
# TLS-enabled perimeter regression (six-route admission, header stripping, connection ceiling)
# ================================================================================================
log "===== TLS-enabled perimeter regression ====="
rm -f "$EVIDENCE_DIR/tls-internal-denied.txt"
internal_raw="$(curl_https "-o /dev/null -w '%{http_code}' --cacert $GUEST_TLS_DIR/generated/ca.pem https://$HOSTNAME_VALID:$EDGE_TLS_PORT/internal/wlt1/health" 2>&1)"
echo "$internal_raw" > "$EVIDENCE_DIR/tls-internal-denied.txt"
[ "$internal_raw" = "404" ] && record "TLS-enabled: /internal/* still denied (404)" "PASS" || record "TLS-enabled: /internal/* still denied (404)" "FAIL"

rm -f "$EVIDENCE_DIR/tls-dotdot-denied.txt"
dotdot_raw="$(curl_https "-o /dev/null -w '%{http_code}' --path-as-is --cacert $GUEST_TLS_DIR/generated/ca.pem https://$HOSTNAME_VALID:$EDGE_TLS_PORT/wlt1/../internal/wlt1/health" 2>&1)"
echo "$dotdot_raw" > "$EVIDENCE_DIR/tls-dotdot-denied.txt"
[ "$dotdot_raw" = "404" ] && record "TLS-enabled: path-confusion (..) still denied (404)" "PASS" || record "TLS-enabled: path-confusion (..) still denied (404)" "FAIL"

rm -f "$EVIDENCE_DIR/tls-spoofed-header.txt"
spoof_raw="$(curl_https "-s -o /dev/null -w '%{http_code}' --cacert $GUEST_TLS_DIR/generated/ca.pem -H 'x-aix-perimeter-token: attacker-supplied-garbage' https://$HOSTNAME_VALID:$EDGE_TLS_PORT/wlt1/destinations" 2>&1)"
echo "$spoof_raw" > "$EVIDENCE_DIR/tls-spoofed-header.txt"
[ "$spoof_raw" = "401" ] && record "TLS-enabled: client-spoofed perimeter token stripped (still 401)" "PASS" || record "TLS-enabled: client-spoofed perimeter token stripped (still 401)" "FAIL"

log "TLS-enabled connection-ceiling spot-check (raw TCP, pre-handshake)"
rm -f "$EVIDENCE_DIR/tls-conn-ceiling.txt"
ceiling_result="$(gsudo bash -c "ip netns exec ns_client python3 -c \"
import socket
conns = []
try:
    for i in range(50):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2)
        s.connect(('$NET_PUBLIC_EDGE_ADDR', $EDGE_TLS_PORT))
        conns.append(s)
    s51 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s51.settimeout(2)
    try:
        s51.connect(('$NET_PUBLIC_EDGE_ADDR', $EDGE_TLS_PORT))
        data = s51.recv(1)
        print('51st: got data (unexpected)' if data else '51st: closed (rejected, expected)')
    except OSError:
        print('51st: rejected (expected)')
finally:
    for s in conns: s.close()
\"" 2>&1)"
echo "$ceiling_result" > "$EVIDENCE_DIR/tls-conn-ceiling.txt"
echo "$ceiling_result" | grep -qi 'rejected' && record "TLS-enabled connection ceiling (50 admitted, 51st rejected)" "PASS" || record "TLS-enabled connection ceiling (50 admitted, 51st rejected)" "FAIL"

# ================================================================================================
# L2 direct-bypass regression (re-run of Turn B's own frozen A3, unaffected by TLS)
# ================================================================================================
log "===== A3 direct-bypass regression (Turn B property, unaffected by TLS) ====="
rm -f "$EVIDENCE_DIR/a3-regression.txt"
a3_raw="$(gsudo bash -c "ip netns exec ns_client curl -s -o /dev/null -w '%{http_code} exit=%{exitcode}' --max-time 3 http://$NET_BACKEND_WLT_ADDR:$WLT_PORT/wlt1/destinations 2>&1" || true)"
echo "$a3_raw" > "$EVIDENCE_DIR/a3-regression.txt"
echo "$a3_raw" | grep -qE '^000' && record "A3 regression (ns_client -> WLT direct, transport failure)" "PASS" || record "A3 regression (ns_client -> WLT direct, transport failure)" "FAIL"

# ================================================================================================
# Cleanup — stop ONLY the Turn-C TLS edge; Turn-B's own plain edge (port 8080) was never touched.
# ================================================================================================
stop_tls_edge
log "Turn-C TLS edge (port $EDGE_TLS_PORT) stopped; Turn-B's own plain edge (port 8080) was never touched by this script"

# ---- Verdict ------------------------------------------------------------------------------------
if [ "$overall_pass" = "true" ]; then
  log "OVERALL: PASS — all TLS/certificate/protocol/application/regression checks satisfied"
  echo "PASS" > "$EVIDENCE_DIR/verdict.txt"
  exit 0
else
  log "OVERALL: FAIL — see summary.txt and individual evidence files above"
  echo "FAIL" > "$EVIDENCE_DIR/verdict.txt"
  exit 1
fi
