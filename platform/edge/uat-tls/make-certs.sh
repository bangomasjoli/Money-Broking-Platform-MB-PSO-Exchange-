#!/usr/bin/env bash
# IMP-02 Turn C — UAT-only ephemeral TLS certificate generation.
#
# UAT TLS HARNESS ONLY. NOT PRODUCTION. NO REAL CA. NO REAL HOSTNAME.
#
# Generates, into $OUT_DIR (default: this directory's generated/ — git-ignored), a local
# ephemeral test CA and four leaf materials:
#   ca.pem / ca-key.pem               — the test CA itself (~30 day validity)
#   valid-cert.pem / valid-key.pem    — CN/SAN uat-edge.aix.invalid, ~7 day validity (T1/T5-T8)
#   wrong-host-cert.pem / wrong-host-key.pem — SAN wrong-host.aix.invalid, same CA, valid dates (T3)
#   expired-cert.pem / expired-key.pem       — SAN uat-edge.aix.invalid, notBefore/notAfter both
#                                               in the past, real (not simulated) expiry (T4)
#
# Uses only the guest's stock `openssl` CLI (already present as part of the base Ubuntu install;
# libssl-dev is a separate, build-time-only dependency for HAProxy itself — see README.md). The
# expired certificate is produced via `openssl ca -startdate/-enddate` (a real CA-signing
# workflow, not a `-not_before`/`-not_after` flag on `req -x509`, which this OpenSSL build does
# not support — verified empirically during Turn C Phase 0).
#
# Key type: ECDSA P-256 throughout — no RSA, no production key material, no real CA.
# Reversibility: rm -rf "$OUT_DIR" removes everything this script creates.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-$HERE/generated}"
HOSTNAME_VALID="uat-edge.aix.invalid"
HOSTNAME_WRONG="wrong-host.aix.invalid"

log() { printf '[make-certs] %s\n' "$*" >&2; }

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/ca/newcerts"
touch "$OUT_DIR/ca/index.txt"
echo 1000 > "$OUT_DIR/ca/serial"

log "generating test CA (ECDSA P-256, ~30 day validity, non-production)"
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 \
  -keyout "$OUT_DIR/ca-key.pem" -out "$OUT_DIR/ca.pem" \
  -days 30 -nodes -subj "/CN=IMP-02 UAT Test CA (NOT A REAL CA)"

cat > "$OUT_DIR/ca/ca.cnf" <<EOF
[ca]
default_ca = CA_default
[CA_default]
dir = $OUT_DIR/ca
database = \$dir/index.txt
new_certs_dir = \$dir/newcerts
serial = \$dir/serial
private_key = $OUT_DIR/ca-key.pem
certificate = $OUT_DIR/ca.pem
default_md = sha256
policy = policy_any
x509_extensions = v3_leaf
[policy_any]
commonName = supplied
[req]
distinguished_name = req_dn
[req_dn]
[v3_leaf]
subjectAltName = \$ENV::SAN
basicConstraints = CA:FALSE
EOF

issue_leaf() {
  local name="$1" san="$2" startdate="$3" enddate="$4"
  log "issuing $name (SAN=$san, notBefore=$startdate, notAfter=$enddate)"
  openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
    -keyout "$OUT_DIR/$name-key.pem" -out "$OUT_DIR/$name.csr" \
    -subj "/CN=$name (IMP-02 UAT, NOT A REAL CERTIFICATE)" >/dev/null 2>&1
  SAN="DNS:$san" openssl ca -batch -config "$OUT_DIR/ca/ca.cnf" \
    -in "$OUT_DIR/$name.csr" -out "$OUT_DIR/$name-cert.pem" \
    -startdate "$startdate" -enddate "$enddate" >/dev/null 2>&1
  cat "$OUT_DIR/$name-cert.pem" "$OUT_DIR/$name-key.pem" > "$OUT_DIR/$name-combined.pem"
  rm -f "$OUT_DIR/$name.csr"
}

now_startdate="$(date -u +%Y%m%d%H%M%SZ)"
future_enddate="$(date -u -d '+7 days' +%Y%m%d%H%M%SZ 2>/dev/null || date -u -v+7d +%Y%m%d%H%M%SZ)"
issue_leaf "valid" "$HOSTNAME_VALID" "$now_startdate" "$future_enddate"
issue_leaf "wrong-host" "$HOSTNAME_WRONG" "$now_startdate" "$future_enddate"
# Real, not simulated, expiry — both notBefore and notAfter are in the past.
issue_leaf "expired" "$HOSTNAME_VALID" "20240101000000Z" "20240102000000Z"

log "verifying expired-cert.pem is genuinely expired (openssl x509 -checkend 0)"
if openssl x509 -in "$OUT_DIR/expired-cert.pem" -noout -checkend 0 >/dev/null 2>&1; then
  log "ERROR: expired-cert.pem is NOT expired — generation failed"
  exit 1
fi
log "confirmed: expired-cert.pem has already expired"

log "certificates written to $OUT_DIR (git-ignored, ephemeral)"
