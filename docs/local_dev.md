# Local end-to-end dev environment

Runs the whole MinCirklen stack on your laptop — no internet required once
images are pulled — mirroring `IaC/environments/prod`'s architecture:

| Cloud (prod)                 | Local substitute                     |
| ----------------------------- | ------------------------------------- |
| Cloud SQL (Postgres)          | `postgres` container                  |
| Memorystore (Redis)           | `redis` container                     |
| Pub/Sub-style fanout          | `nats` container (JetStream enabled)  |
| Cloud Run: `trpc-api`         | `trpc-api` container                  |
| GKE: `websocket-service`      | `websocket-service` container         |
| Cloud Run: `moderation-service` (stub locally) | `moderation-service` container |
| Cloud Run: `web-app`          | `web-app` container                   |
| HTTPS Load Balancer           | `caddy` container (real HTTPS via a local CA) |

This stack is entirely self-contained to this repo — its own `dns`
container, its own Caddy — with `dns` on host port 53 and `caddy` on 80/443
directly (no port suffix needed in URLs). That means **no other local
project that also binds 53/80/443 can run at the same time**; stop it
first if you hit a port conflict (e.g. `docker compose down` in that
project's directory).

## One-time setup

Run from the repo root:

```
./setup-local-dns.sh
./setup-local-certs.sh
```

`setup-local-dns.sh` makes `dev-mincirklen.dk` (and subdomains) resolve to
`127.0.0.1` on this machine, using only this repo's own `dns` service
(`local-infra/dns/dnsmasq.conf`) — it never reads or modifies another project's
DNS config. This step only needs macOS — it edits
`/etc/resolver/dev-mincirklen.dk` and asks for `sudo`.

`setup-local-certs.sh` uses [mkcert](https://github.com/FiloSottile/mkcert) to
mint a cert for `dev-mincirklen.dk`/`*.dev-mincirklen.dk` and trust its
local CA, so Caddy can terminate real, browser-trusted HTTPS instead of a
self-signed cert your browser would warn about. Requires `brew install
mkcert`. The cert lands in `local-infra/caddy/certs/` (gitignored — it's
machine-specific, signed by that machine's own local CA).

Both scripts are safe to re-run and neither runs itself — you run them,
once, per machine.

If Caddy crash-loops with `permission denied` reading the key file — this
happens if `setup-local-certs.sh` ever got run with `sudo` by mistake,
which leaves the cert/key owned by `root` and unreadable by Docker
Desktop's file-sharing daemon (which runs as your normal user) — fix just
the ownership/permissions, isolated from the rest of the script so it
won't regenerate certs or touch mkcert:

```
sudo ./setup-local-certs.sh --fix-permissions
```

## Every day

```
docker compose up -d --build
```

Then visit:

- `https://dev-mincirklen.dk` — the web app
- `https://trpc.dev-mincirklen.dk` — tRPC API (e.g. `/health`)
- `https://socket.dev-mincirklen.dk` — WebSocket service (e.g. `/healthz`)

Plain `http://...` also works and redirects to HTTPS.

Or skip DNS entirely and hit containers directly on the host:

| Service             | Host port |
| -------------------- | --------- |
| web-app (Vite)        | 5190      |
| trpc-api              | 8787      |
| websocket-service      | 8091      |
| postgres               | 5433      |
| redis                  | 6379      |
| nats (client / monitor) | 4222 / 8222 |
| dns (udp/tcp)          | 53        |
| caddy (http / https)   | 80 / 443  |

`moderation-service` is intentionally **not** published to the host, matching
the cloud setup where it's never publicly reachable — only other containers
on the compose network can reach it.

## Remote access via VPN (optional)

To reach `https://dev-mincirklen.dk` from a phone or laptop off your LAN
(e.g. working from a coffee shop or traveling), an optional `vpn` service
(WireGuard, via [wg-easy](https://github.com/wg-easy/wg-easy)) is included
in `docker-compose.yml`. It's gated behind a Compose profile, so it never
starts as part of a normal `docker compose up -d`/`down` — only via
`docker compose up -d vpn` or the setup script below.

```
./setup-local-dns.sh   # if you haven't already
./setup-local-vpn.sh
```

`setup-local-vpn.sh` detects your Mac's LAN IP and starts the `vpn` service, then
walks you through the rest — wg-easy v15 has no environment-variable setup,
so the admin account and WireGuard endpoint/DNS settings are configured
through a one-time web setup wizard at `http://<your-LAN-IP>:51821/`
instead (nothing secret lands in this repo). You'll need a stable public
hostname for the endpoint — set up a free dynamic-DNS hostname like
[DuckDNS](https://www.duckdns.org) first if your home IP isn't static.
After the wizard: forward a UDP port on your router, add your phone as a
peer via the admin UI (QR code), and trust this machine's mkcert root CA on
the phone so HTTPS doesn't warn.

Note this changes how `dev-mincirklen.dk` resolves even without the VPN
active: `setup-local-dns.sh` answers with your Mac's current LAN IP rather
than `127.0.0.1` (a loopback answer would be useless to a remote client),
and `dns`/`caddy` are bound to all interfaces rather than `127.0.0.1` only.
See `SECURITY.md` for the trust-boundary implications.

## Live reload

Every app service (`web-app`, `trpc-api`, `websocket-service`,
`moderation-service`) builds from its `dev.Dockerfile`, which installs
dependencies only and expects the source to be bind-mounted — see the
`volumes:` entries in `docker-compose.yml`. Editing any file under
`services/*/src` restarts/hot-reloads that service's process inside the
container; you don't need to rebuild the image for source changes. A
rebuild (`docker compose up -d --build`) is only needed after changing a
`package.json`/lockfile.

`prod.Dockerfile` in each service is the other half: it copies the source
in and builds the production artifact, matching what actually gets pushed
and deployed per `IaC/`. It's not used by `docker-compose.yml` at all —
it's there to be built and tested standalone, e.g. `docker build -f
services/web-app/prod.Dockerfile -t mincirklen-web-app:prod services/web-app`.

## Tearing down

```
docker compose down            # stop and remove containers, keep data volumes
docker compose down -v         # also wipe postgres/redis/nats data
```

`setup-local-dns.sh`'s changes are machine-level (not part of the compose
stack) and aren't undone by either of the above — they're meant to persist
across `docker compose down`/`up` cycles.
