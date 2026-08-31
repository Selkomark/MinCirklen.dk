# This builds the STUB service (see src/index.ts) — useful for exercising
# IaC/environments/prod's moderation-service Cloud Run shell end-to-end
# before the real, proprietary service exists. Do not actually deploy this
# stub to a real production environment.
#
# Build context is the repo root — see dev.Dockerfile's comment on why.
FROM oven/bun:1.3-alpine AS build

WORKDIR /app
COPY package.json bun.lock ./
COPY packages/proto/package.json packages/proto/package.json
COPY services/moderation-service/package.json services/moderation-service/package.json
RUN bun install --frozen-lockfile
COPY packages/proto packages/proto
COPY services/moderation-service services/moderation-service
WORKDIR /app/services/moderation-service
RUN bun run build

FROM oven/bun:1.3-alpine

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/services/moderation-service/dist ./dist

EXPOSE 8082

CMD ["bun", "run", "dist/index.js"]
