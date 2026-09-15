#!/usr/bin/env bash
# IMP-02 Turn B — L2 UAT isolation topology orchestration.
#
# UAT TOPOLOGY HARNESS ONLY. NOT PRODUCTION. NO CLOUD COMMITMENT. NO CONTAINER COMMITMENT.
#
# Builds, inside one disposable Lima guest (lima.yaml, vmType: vz — no host root, no sudoers
# change, nothing installed on the macOS host), the three-namespace topology DEC-010 L2 requires:
#
#   ns_client (10.80.0.2/24, net_public only)
#      |
#   net_public (10.80.0.0/24)
#      |
#   ns_edge (10.80.0.1/24 public side, 10.90.0.1/24 backend side — the ONLY namespace on both)
#      |
#   net_backend (10.90.0.0/24)
#      |
#   ns_backend (10.90.0.2/24, net_backend only)
#
# ns_edge runs the REAL, unmodified Turn-A HAProxy 3.0.27 config (haproxy.base.cfg +
# uat/haproxy.limits.cfg, loaded verbatim — never copied/reimplemented, never edited). ns_backend
# runs the REAL, unmodified services/wlt1. ns_client has no interface, no route, and no membership
# on net_backend — that absence is the property being proven, not a firewall rule layered on top
# of shared reachability.
#
# All privileged networking (`ip netns`, veth) happens ONLY inside the disposable guest, via
# passwordless guest-local sudo — never on the macOS host, which is never asked for a password or
# any privilege elevation by this script.
#
# Usage:
#   ./topology.sh up                    # start guest, build topology, start edge (valid token) + WLT
#   ./topology.sh edge-wrong-token       # restart ONLY the edge with a mismatched perimeter token (A4)
#   ./topology.sh edge-valid-token       # restore the edge to the valid perimeter token
#   ./topology.sh status                 # print namespace/route/service status
#   ./topology.sh down                   # stop the guest (topology + services are destroyed with it)
#   ./topology.sh destroy                # stop AND delete the guest entirely (full reversal)
#
# Requires: Lima on PATH (or LIMACTL set to its path) — NOT installed by this script. See README.md.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd)"
PLATFORM_ROOT="$REPO_ROOT/platform"
INSTANCE_NAME="${IMP02_TOPOLOGY_INSTANCE:-imp02-topology}"
LIMACTL="${LIMACTL:-limactl}"

# Governed HAProxy pin — the SAME source identity as Turn A (platform/edge/VERSION,
# platform/edge/README.md). This script builds it independently inside the guest (Linux target)
# because Turn A's own macOS-built binary cannot run inside a Linux guest — the SOURCE and its
# digest are what must match, not the compiled artifact.
HAPROXY_VERSION="3.0.27"
HAPROXY_SHA256="c200b72ed5078d99d4bd658834478058409420b45d08dcec7e7a015e9c7b1dd1"

# Explicitly non-secret dummy credential — never a real operational perimeter token. Long enough
# to satisfy WLT-01's >=32-character WLT1_PUBLIC_PERIMETER_TOKEN contract.
VALID_TOKEN="turnb-topology-dummy-token-NOT-A-REAL-SECRET-0123456789"
WRONG_TOKEN="turnb-topology-WRONG-dummy-token-NOT-A-REAL-SECRET-abcdef"

NET_PUBLIC_EDGE_ADDR="10.80.0.1"
NET_PUBLIC_CLIENT_ADDR="10.80.0.2"
NET_BACKEND_EDGE_ADDR="10.90.0.1"
NET_BACKEND_WLT_ADDR="10.90.0.2"
EDGE_PORT="8080"
WLT_PORT="8090"

log() { printf '[topology] %s\n' "$*" >&2; }
die() { printf '[topology] ERROR: %s\n' "$*" >&2; exit 1; }

require_limactl() {
  command -v "$LIMACTL" >/dev/null 2>&1 || die \
    "no 'limactl' found on PATH (set LIMACTL to its path). Lima is NOT installed by this repository — see README.md for the exact governed acquisition/verification steps."
}

gsh() { "$LIMACTL" shell "$INSTANCE_NAME" -- "$@"; }
gsudo() { "$LIMACTL" shell "$INSTANCE_NAME" -- sudo "$@"; }

# Polls (never a fixed sleep) for a listener to appear in the given namespace, up to a generous
# budget — `npm exec tsx` resolving/compiling on first run, or general VM scheduling contention on
# a 2-vCPU guest, does not always complete within a short fixed wait, and a race here must fail
# loud with the real boot log, never silently report success/failure based on timing luck.
wait_for_listener() {
  local ns="$1" port="$2" logfile="$3" label="$4"
  local budget="${5:-60}"
  local waited=0
  while [ "$waited" -lt "$budget" ]; do
    # ip netns exec requires root (CAP_SYS_ADMIN) — must use gsudo, never plain gsh, or this
    # check silently fails with a permission error on every iteration regardless of real state.
    if gsudo bash -c "ip netns exec $ns ss -tlnp 2>/dev/null | grep -q ':$port '"; then
      log "$label: listening on port $port after ${waited}s"
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  log "$label: FAILED to bind port $port within ${budget}s — boot log follows"
  gsh bash -c "cat $logfile" || true
  return 1
}

ensure_guest_running() {
  if ! "$LIMACTL" list --format '{{.Name}}' 2>/dev/null | grep -qx "$INSTANCE_NAME"; then
    log "starting Lima guest '$INSTANCE_NAME' (vmType: vz, no host privilege required)"
    "$LIMACTL" start --name="$INSTANCE_NAME" --tty=false "$HERE/lima.yaml"
  elif [ "$("$LIMACTL" list --format '{{.Status}}' "$INSTANCE_NAME" 2>/dev/null)" != "Running" ]; then
    log "starting existing stopped guest '$INSTANCE_NAME'"
    "$LIMACTL" start "$INSTANCE_NAME"
  else
    log "guest '$INSTANCE_NAME' already running"
  fi
}

# Idempotent: skips work already done (checked via marker files / existing binaries inside guest).
prepare_guest_toolchain() {
  log "verifying/installing Node.js inside guest"
  if ! gsh bash -c 'command -v node >/dev/null 2>&1 && node --version | grep -qE "^v(2[0-9]|[3-9][0-9])\."'; then
    gsh bash -c 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/tmp/nodesource.log 2>&1 && sudo apt-get install -y -qq nodejs >/tmp/node-install.log 2>&1'
  fi
  gsh node --version

  log "verifying/building governed HAProxy $HAPROXY_VERSION inside guest (Linux target)"
  if ! gsh bash -c "test -x ~/haproxy-build/haproxy-$HAPROXY_VERSION/haproxy && ~/haproxy-build/haproxy-$HAPROXY_VERSION/haproxy -v 2>/dev/null | grep -q ' $HAPROXY_VERSION'"; then
    gsh bash -c "
      set -euo pipefail
      mkdir -p ~/haproxy-build && cd ~/haproxy-build
      [ -f haproxy-$HAPROXY_VERSION.tar.gz ] || curl -fsSLO https://www.haproxy.org/download/3.0/src/haproxy-$HAPROXY_VERSION.tar.gz
      echo '$HAPROXY_SHA256  haproxy-$HAPROXY_VERSION.tar.gz' | sha256sum -c -
      rm -rf haproxy-$HAPROXY_VERSION
      tar xzf haproxy-$HAPROXY_VERSION.tar.gz
      cd haproxy-$HAPROXY_VERSION
      make -j\"\$(nproc)\" TARGET=linux-glibc
    "
  fi
  gsh bash -c "~/haproxy-build/haproxy-$HAPROXY_VERSION/haproxy -v"
}

# Copies the CURRENT working-tree platform/ (never a stale/cached copy) into the guest, excluding
# node_modules and dependency locks the guest will resolve itself. This is how the harness
# consumes Turn A's config files "unchanged, never copied/reimplemented" — it copies the literal
# bytes at run time rather than embedding any duplicate of their content in this repository.
copy_platform_into_guest() {
  log "copying current platform/ working tree into guest (excludes node_modules/.git)"
  local tarball
  tarball="$(mktemp -t imp02-platform-src.XXXXXX.tar.gz)"
  tar czf "$tarball" -C "$REPO_ROOT" --exclude=node_modules --exclude=.git platform
  "$LIMACTL" copy "$tarball" "$INSTANCE_NAME:/tmp/platform-src.tar.gz"
  rm -f "$tarball"
  gsh bash -c 'rm -rf ~/platform && tar xzf /tmp/platform-src.tar.gz -C ~/ && rm -f /tmp/platform-src.tar.gz'
  gsh bash -c 'cd ~/platform && npm install --no-audit --no-fund >/tmp/npm-install.log 2>&1 && echo npm_install_ok'
}

# All `ip netns` / veth work happens INSIDE the guest via passwordless guest-local sudo — never on
# the macOS host. Idempotent: tears down any prior namespace state with the same names first.
setup_namespaces() {
  log "tearing down any prior namespace state (idempotent)"
  gsudo bash -c '
    ip netns del ns_client 2>/dev/null || true
    ip netns del ns_edge 2>/dev/null || true
    ip netns del ns_backend 2>/dev/null || true
    ip link del v-pub-edg 2>/dev/null || true
    ip link del v-bck-edg 2>/dev/null || true
  '

  # Interface names are constrained to 15 characters (Linux IFNAMSIZ) — kept short and consistent:
  # v-pub-cli/v-pub-edg form the net_public veth pair; v-bck-edg/v-bck-be form net_backend's.
  log "creating ns_client, ns_edge, ns_backend"
  gsudo bash -c '
    set -euo pipefail
    ip netns add ns_client
    ip netns add ns_edge
    ip netns add ns_backend

    # net_public: ns_client <-> ns_edge
    ip link add v-pub-cli type veth peer name v-pub-edg
    ip link set v-pub-cli netns ns_client
    ip link set v-pub-edg netns ns_edge

    # net_backend: ns_edge <-> ns_backend
    ip link add v-bck-edg type veth peer name v-bck-be
    ip link set v-bck-edg netns ns_edge
    ip link set v-bck-be netns ns_backend

    ip -n ns_client addr add '"$NET_PUBLIC_CLIENT_ADDR"'/24 dev v-pub-cli
    ip -n ns_client link set v-pub-cli up
    ip -n ns_client link set lo up

    ip -n ns_edge addr add '"$NET_PUBLIC_EDGE_ADDR"'/24 dev v-pub-edg
    ip -n ns_edge link set v-pub-edg up
    ip -n ns_edge addr add '"$NET_BACKEND_EDGE_ADDR"'/24 dev v-bck-edg
    ip -n ns_edge link set v-bck-edg up
    ip -n ns_edge link set lo up

    ip -n ns_backend addr add '"$NET_BACKEND_WLT_ADDR"'/24 dev v-bck-be
    ip -n ns_backend link set v-bck-be up
    ip -n ns_backend link set lo up

    # Explicit, verified — never assumed. IMP-02 requires ns_edge NEVER become an IP router; it is
    # an application-layer proxy only. See evidence capture for the read-back of these values.
    ip netns exec ns_edge sysctl -w net.ipv4.ip_forward=0
    ip netns exec ns_edge sysctl -w net.ipv6.conf.all.forwarding=0
  '
  log "namespace topology created; ns_client has NO interface and NO route to net_backend (10.90.0.0/24) by construction"
}

start_wlt_in_backend() {
  log "starting real WLT-01 in ns_backend ($NET_BACKEND_WLT_ADDR:$WLT_PORT), zero live dependencies"
  # Kill by namespace membership, not process-name pattern matching (the npx/tsx/node process
  # chain's exact argv does not reliably contain a stable matchable string) — only this harness's
  # own processes are ever placed in ns_backend, so this is safe and precise.
  gsudo bash -c 'for pid in $(ip netns pids ns_backend 2>/dev/null); do kill -9 "$pid" 2>/dev/null || true; done; sleep 1'
  gsudo bash -c "
    cd ~lima/platform
    cat > /tmp/wlt.env <<EOF
ENVIRONMENT=uat
DATABASE_URL=postgres://placeholder:placeholder@10.90.0.99:5432/placeholder_not_live
PORT=$WLT_PORT
WLT1_INTERNAL_SERVICE_TOKEN=turnb-topology-wlt1-internal-token-dummy
CLT1_BASE_URL=http://10.90.0.99:8085
CLT1_INTERNAL_SERVICE_TOKEN=turnb-topology-clt1-internal-token-dummy
IAM2_BASE_URL=http://10.90.0.99:8082
IAM2_INTERNAL_SERVICE_TOKEN=turnb-topology-iam2-internal-token-dummy
AML1_BASE_URL=http://10.90.0.99:8088
AML1_INTERNAL_SERVICE_TOKEN=turnb-topology-aml1-internal-token-dummy
WLT1_FIAT_ENC_KEY=turnb-topology-fiat-enc-key-at-least-32-characters-long
IAM_BASE_URL=http://10.90.0.99:8081
IAM_INTROSPECTION_SERVICE_TOKEN=turnb-topology-iam-introspection-token-dummy
FND_BASE_URL=http://10.90.0.99:8080
FND_RATE_LIMIT_CONSUMER_TOKEN=turnb-topology-fnd-ratelimit-consumer-token-dummy
WLT1_PUBLIC_DESTINATION_LIST_MAX=100
WLT1_PUBLIC_SURFACE_ENABLED=true
WLT1_PUBLIC_PERIMETER_TOKEN=$VALID_TOKEN
EOF
    set -a; source /tmp/wlt.env; set +a
    rm -f /tmp/wlt-boot.log
    setsid ip netns exec ns_backend npx tsx services/wlt1/src/index.ts < /dev/null > /tmp/wlt-boot.log 2>&1 &
  "
  wait_for_listener ns_backend "$WLT_PORT" /tmp/wlt-boot.log "WLT-01"
}

# token: "valid" or "wrong" — see A4 (L3 regression through the isolated topology).
start_edge_in_ns_edge() {
  local mode="${1:-valid}"
  local token="$VALID_TOKEN"
  [ "$mode" = "wrong" ] && token="$WRONG_TOKEN"

  log "starting real, UNMODIFIED Turn-A HAProxy config in ns_edge ($NET_PUBLIC_EDGE_ADDR:$EDGE_PORT -> $NET_BACKEND_WLT_ADDR:$WLT_PORT), perimeter-token mode: $mode"
  # Kill by namespace membership (see start_wlt_in_backend's identical rationale).
  gsudo bash -c 'for pid in $(ip netns pids ns_edge 2>/dev/null); do kill -9 "$pid" 2>/dev/null || true; done; sleep 1'
  gsudo bash -c "
    cd ~lima/platform/edge
    rm -f /tmp/edge-boot.log
    setsid ip netns exec ns_edge env \
      EDGE_BIND_ADDR=$NET_PUBLIC_EDGE_ADDR \
      EDGE_BIND_PORT=$EDGE_PORT \
      EDGE_WLT1_UPSTREAM_ADDR=$NET_BACKEND_WLT_ADDR:$WLT_PORT \
      WLT1_PUBLIC_PERIMETER_TOKEN=$token \
      EDGE_BODY_LIMIT_BYTES=65536 \
      EDGE_HEADER_TIMEOUT=5s \
      EDGE_IDLE_TIMEOUT=30s \
      EDGE_CONN_LIMIT_PER_BUCKET=50 \
      ~lima/haproxy-build/haproxy-$HAPROXY_VERSION/haproxy -f haproxy.base.cfg -f uat/haproxy.limits.cfg -db < /dev/null > /tmp/edge-boot.log 2>&1 &
  "
  wait_for_listener ns_edge "$EDGE_PORT" /tmp/edge-boot.log "HAProxy edge"
}

cmd_up() {
  require_limactl
  ensure_guest_running
  prepare_guest_toolchain
  copy_platform_into_guest
  setup_namespaces
  start_wlt_in_backend
  start_edge_in_ns_edge valid
  log "topology up: ns_client (no backend route) -> net_public -> ns_edge -> net_backend -> ns_backend"
}

cmd_status() {
  require_limactl
  gsudo bash -c '
    echo "--- ip netns list ---"; ip netns list
    for ns in ns_client ns_edge ns_backend; do
      echo "--- $ns addr ---"; ip -n $ns addr show 2>/dev/null || echo "(namespace not present)"
      echo "--- $ns route ---"; ip -n $ns route show 2>/dev/null || true
    done
    echo "--- ns_edge forwarding state ---"
    ip netns exec ns_edge sysctl net.ipv4.ip_forward net.ipv6.conf.all.forwarding 2>/dev/null || true
  '
}

cmd_down() {
  require_limactl
  "$LIMACTL" stop "$INSTANCE_NAME" 2>&1 || true
}

cmd_destroy() {
  require_limactl
  "$LIMACTL" stop "$INSTANCE_NAME" 2>&1 || true
  "$LIMACTL" delete "$INSTANCE_NAME" 2>&1 || true
}

case "${1:-}" in
  up) cmd_up ;;
  edge-wrong-token) require_limactl; start_edge_in_ns_edge wrong ;;
  edge-valid-token) require_limactl; start_edge_in_ns_edge valid ;;
  status) cmd_status ;;
  down) cmd_down ;;
  destroy) cmd_destroy ;;
  *) die "usage: $0 {up|edge-wrong-token|edge-valid-token|status|down|destroy}" ;;
esac
