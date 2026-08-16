# Production image — this is what IaC/modules/cloud-run's `image` variable
# should eventually point at (built and pushed by this service's own CI
# pipeline, per tech spec section 7.3), not something docker-compose uses.
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

EXPOSE 8787

CMD ["bun", "run", "dist/index.js"]
