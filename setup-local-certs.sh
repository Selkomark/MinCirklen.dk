#!/usr/bin/env bash
# Generates a locally-trusted TLS cert for dev-mincirklen.dk (+ subdomains)
# so the local stack can run under https://. NOT executed automatically —
# run it yourself:
#
#   ./setup-local-certs.sh
#
# Uses mkcert: it maintains a local CA (created once per machine, under
# mkcert -CAROOT) and installs its root into your system/browser trust
# stores, then mints a leaf cert off that CA for the given domains. Nothing
# under mkcert -CAROOT is ever touched if it already exists — this only
# adds a leaf cert for dev-mincirklen.dk, it doesn't recreate the CA or
# affect certs mkcert has issued for any other project on this machine.
#
# Safe to re-run: regenerates the leaf cert in place; `mkcert -install` is
# a no-op if the CA is already trusted.

set -euo pipefail

DOMAIN="dev-mincirklen.dk"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${REPO_ROOT}/local-infra/caddy/certs"

log() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
die() {
  printf '\033[1;31mERROR:\033[0m %s\n' "$1" >&2
  exit 1
}

command -v mkcert >/dev/null 2>&1 || die "mkcert is required. Install it with: brew install mkcert (and 'brew install nss' if you also use Firefox)."

log "Ensuring mkcert's local CA is trusted (installs it into the system/browser trust stores if not already; no-op otherwise)."
mkcert -install

mkdir -p "$CERT_DIR"

log "Generating a cert for ${DOMAIN} and its subdomains -> ${CERT_DIR}"
mkcert \
  -cert-file "${CERT_DIR}/${DOMAIN}.pem" \
  -key-file "${CERT_DIR}/${DOMAIN}-key.pem" \
  "$DOMAIN" "*.${DOMAIN}"

cat <<EOF

Done. Certs written to:
  ${CERT_DIR}/${DOMAIN}.pem
  ${CERT_DIR}/${DOMAIN}-key.pem

Next: (re)start Caddy so it picks them up:
  docker compose up -d --build caddy

Then visit: https://${DOMAIN}
EOF
