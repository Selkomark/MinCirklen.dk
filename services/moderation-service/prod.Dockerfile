# This builds the STUB service (see src/index.ts) — useful for exercising
# IaC/environments/prod's moderation-service Cloud Run shell end-to-end
# before the real, proprietary service exists. Do not actually deploy this
# stub to a real production environment.
FROM oven/bun:1.3-alpine AS build

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3-alpine

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist

EXPOSE 8082

CMD ["bun", "run", "dist/index.js"]
