# Same pattern as trpc-api/prod.Dockerfile — see that file's comment. This
# is what would eventually get pushed and run as a GKE Autopilot workload
# (tech spec section 5), not deployed via this Dockerfile directly — GKE
# needs the image built and pushed to a registry the cluster can pull from.
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

EXPOSE 8080

CMD ["bun", "run", "dist/index.js"]
