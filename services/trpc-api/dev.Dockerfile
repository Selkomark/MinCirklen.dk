# Dev image: install deps only. Source is bind-mounted at runtime (see
# docker-compose.yml) so edits on the host are picked up immediately by
# `bun --watch` — no image rebuild, no restart needed for a code change.
FROM oven/bun:1.3-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

EXPOSE 8787

CMD ["bun", "run", "dev"]
