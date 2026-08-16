#!/usr/bin/env bash
# Sets up local DNS so dev-mincirklen.dk (and its subdomains) resolve to
# 127.0.0.1 for the docker-compose.yml stack, on any Mac this repo is
# checked out on. NOT executed automatically anywhere — run it yourself
# when you're ready:
#
#   ./setup-local-dns.sh
#
# Entirely self-contained to this repo: it only starts/uses this repo's own
# `dns` service (local-infra/dns/dnsmasq.conf, defined in docker-compose.yml) and
# never reads or modifies another project's DNS config. That does mean this
# stack's `dns` service and any other project's DNS container binding host
# port 53 can't run at the same time — stop the other one first if you hit
# a conflict.
#
# What it does, in order:
#   1. Starts this repo's `dns` container (docker compose up -d dns),
#      bound to 127.0.0.1:53.
#   2. Writes /etc/resolver/dev-mincirklen.dk (macOS's per-domain resolver
#      mechanism) so only queries for this domain go to the local dnsmasq —
#      every other domain keeps resolving normally. Requires sudo.
#   3. Flushes the macOS DNS cache and verifies resolution.
#
# Safe to re-run: every step checks current state before changing anything.

set -euo pipefail

DOMAIN="dev-mincirklen.dk"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$1" >&2; }
die() {
  printf '\033[1;31mERROR:\033[0m %s\n' "$1" >&2
  exit 1
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  die "This script only supports macOS (/etc/resolver is a macOS-specific mechanism). On Linux, point dev-mincirklen.dk at 127.0.0.1 via /etc/hosts or your systemd-resolved config instead."
fi

command -v docker >/dev/null 2>&1 || die "docker is required (Docker Desktop or compatible) and wasn't found on PATH."
docker info >/dev/null 2>&1 || die "Docker daemon isn't running. Start Docker Desktop and try again."

# --- Step 1: start this repo's own dns container ---

if docker ps --filter 'name=^mincirklen-dns$' --format '{{.Names}}' | grep -q mincirklen-dns; then
  log "mincirklen-dns is already running."
else
  if lsof -nP -iUDP:53 >/dev/null 2>&1; then
    die "Host UDP port 53 is already in use by something else (check: lsof -nP -iUDP:53). Free it up — e.g. stop another project's DNS container — and re-run this script."
  fi
  log "Starting the dns service."
  docker compose -f "${REPO_ROOT}/docker-compose.yml" up -d dns
fi

# --- Step 2: macOS per-domain resolver ---

RESOLVER_FILE="/etc/resolver/${DOMAIN}"
RESOLVER_CONTENT="nameserver 127.0.0.1"

if [[ -f "$RESOLVER_FILE" ]] && grep -qF "$RESOLVER_CONTENT" "$RESOLVER_FILE"; then
  log "${RESOLVER_FILE} already configured — leaving it as-is."
else
  log "Writing ${RESOLVER_FILE} (requires sudo)."
  sudo mkdir -p /etc/resolver
  printf '%s\n' "$RESOLVER_CONTENT" | sudo tee "$RESOLVER_FILE" >/dev/null
fi

# --- Step 3: flush cache and verify ---

log "Flushing macOS DNS cache."
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder >/dev/null 2>&1 || true

sleep 1

log "Verifying resolution for ${DOMAIN} ..."
if dig +short "$DOMAIN" @127.0.0.1 | grep -qE '127\.0\.0\.1|::1'; then
  log "Resolved correctly."
else
  warn "dig didn't return the expected answer — give the DNS container a few seconds and try: dig ${DOMAIN} @127.0.0.1"
fi

cat <<EOF

Done. Next steps:
  docker compose up -d --build
  open https://${DOMAIN}

Subdomains also route through Caddy:
  https://trpc.${DOMAIN}
  https://socket.${DOMAIN}
EOF
