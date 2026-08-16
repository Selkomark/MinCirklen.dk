#!/usr/bin/env bash
# Starts the optional `vpn` service (WireGuard via wg-easy, docker-compose.yml)
# so a phone or laptop off your LAN can tunnel in and reach dev-mincirklen.dk.
# NOT executed automatically anywhere — run it yourself when you're ready:
#
#   ./setup-vpn.sh
#
# Requires ./setup-local-dns.sh to have been run at least once first (it's
# what generates local-infra/dns/dnsmasq.conf and detects your LAN IP).
#
# wg-easy v15 has no environment-variable setup (no WG_HOST/PASSWORD_HASH) —
# the admin account and WireGuard endpoint/DNS settings are configured
# through a web setup wizard on first visit. This script just starts the
# container (profile-gated, so this is the only thing that starts it — a
# plain `docker compose up -d` never touches it) and walks you through the
# rest.
#
# Safe to re-run: if the vpn service is already up, this just re-prints the
# next steps.

set -euo pipefail

DOMAIN="dev-mincirklen.dk"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
die() {
  printf '\033[1;31mERROR:\033[0m %s\n' "$1" >&2
  exit 1
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  die "This script only supports macOS (LAN IP detection uses ipconfig). Adapt the detection command for your OS if you're on Linux."
fi

command -v docker >/dev/null 2>&1 || die "docker is required (Docker Desktop or compatible) and wasn't found on PATH."
docker info >/dev/null 2>&1 || die "Docker daemon isn't running. Start Docker Desktop and try again."

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
[[ -n "$LAN_IP" ]] || die "Couldn't detect a LAN IP on en0/en1 — connect to Wi-Fi or Ethernet and re-run."
log "LAN IP: ${LAN_IP}"

if [[ ! -f "${REPO_ROOT}/local-infra/dns/dnsmasq.conf" ]]; then
  die "local-infra/dns/dnsmasq.conf doesn't exist yet — run ./setup-local-dns.sh first (it generates that file and points dev-mincirklen.dk at your LAN IP)."
fi

log "Starting the vpn service."
docker compose -f "${REPO_ROOT}/docker-compose.yml" up -d vpn

cat <<EOF

Done. This is the short version — see docs/vpn_local_dev.md for full detail,
troubleshooting, and IMPORTANT gotchas (there's an easy mistake in step 1
below that silently breaks everything except the handshake). Remaining
steps:

1. On your Mac's browser, open http://${LAN_IP}:51821/ and complete the
   setup wizard (first visit only — creates the admin account and
   configures the WireGuard endpoint):
     - Endpoint/host: the public hostname clients will dial. If your home
       IP isn't static, set up a free dynamic-DNS hostname first (e.g.
       https://www.duckdns.org) and use that instead of a bare IP.
     - DNS handed to clients: use ${LAN_IP} (this Mac's LAN IP) — that's
       what lets a tunneled client resolve ${DOMAIN}.
   Then in the interface (wg0) settings, change Port from 51820 to 443 to
   match docker-compose.yml's published port. In that same form there's a
   "Device" field — leave it as \`eth0\`. Do NOT change it to \`wg0\` (an easy
   mistake, since you're right there changing the WireGuard port) — this
   silently breaks NAT for all forwarded traffic. See docs/vpn_local_dev.md
   if you already made this mistake; it's fixable.

2. Forward UDP port 443 on your router to this Mac (${LAN_IP}), so the
   WireGuard tunnel port is reachable from outside your home network.
   (Port 51821, the admin UI, does NOT need to be forwarded — only reachable
   on your LAN or once already tunneled in.)

3. In the wg-easy admin UI, add your phone as a client. Before saving,
   set MTU to 1280 and Persistent Keepalive to 25 — both matter for
   reliability on mobile networks (see docs/vpn_local_dev.md for why). Then
   scan the QR code in the WireGuard app.

4. Trust this Mac's mkcert root CA on your phone, so HTTPS to
   https://${DOMAIN} doesn't warn:
     mkcert -CAROOT
   AirDrop or email the rootCA.pem from that directory to your phone, open
   it to install the profile, then on iOS: Settings > General > VPN &
   Device Management to install it, then Settings > General > About >
   Certificate Trust Settings to enable full trust for it.

Once connected, your phone can reach https://${DOMAIN} exactly like this
Mac does.
EOF
