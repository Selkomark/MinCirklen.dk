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

## Live reload

Every app service (`web-app`, `trpc-api`, `websocket-service`,
`moderation-service`) builds from its `dev.Dockerfile`, which installs
dependencies only and expects the source to be bind-mounted — see the
`volumes:` entries in `docker-compose.yml`. Editing any file under
`services/*/src` or `web-app/` restarts/hot-reloads that service's process
inside the container; you don't need to rebuild the image for source
changes. A rebuild (`docker compose up -d --build`) is only needed after
changing a `package.json`/lockfile.

`prod.Dockerfile` in each service is the other half: it copies the source
in and builds the production artifact, matching what actually gets pushed
and deployed per `IaC/`. It's not used by `docker-compose.yml` at all —
it's there to be built and tested standalone, e.g. `docker build -f
web-app/prod.Dockerfile -t mincirklen-web-app:prod web-app`.

## Tearing down

```
docker compose down            # stop and remove containers, keep data volumes
docker compose down -v         # also wipe postgres/redis/nats data
```

`setup-local-dns.sh`'s changes are machine-level (not part of the compose
stack) and aren't undone by either of the above — they're meant to persist
across `docker compose down`/`up` cycles.
