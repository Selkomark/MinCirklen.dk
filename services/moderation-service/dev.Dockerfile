# Same pattern as trpc-api/dev.Dockerfile — see that file's comment.
# Remember: this whole service is a stub (see src/index.ts) — the real
# moderation service is a separate, proprietary build, not this Dockerfile.
FROM oven/bun:1.3-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

EXPOSE 8082

CMD ["bun", "run", "dev"]
