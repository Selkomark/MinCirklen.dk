# Same pattern as trpc-api/dev.Dockerfile — see that file's comment.
FROM oven/bun:1.3-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

EXPOSE 8080

CMD ["bun", "run", "dev"]
