# ---- Build stage ----
FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /src

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/bucket-api-server/package.json packages/bucket-api-server/
COPY packages/crypto/package.json packages/crypto/
COPY packages/server-config/package.json packages/server-config/
COPY packages/tokens/package.json packages/tokens/
COPY packages/ui/package.json packages/ui/
COPY packages/web-shared/package.json packages/web-shared/
COPY s3-browser/api/package.json s3-browser/api/
COPY s3-browser/web/package.json s3-browser/web/
RUN pnpm install --frozen-lockfile

COPY packages/bucket-api-server/ packages/bucket-api-server/
COPY packages/crypto/ packages/crypto/
COPY packages/server-config/ packages/server-config/
COPY packages/tokens/ packages/tokens/
COPY packages/ui/ packages/ui/
COPY packages/web-shared/ packages/web-shared/
COPY s3-browser/api/ s3-browser/api/
COPY s3-browser/web/ s3-browser/web/

RUN pnpm build:packages
RUN pnpm -C s3-browser/api build
RUN pnpm -C s3-browser/web build

RUN pnpm --filter @s3-browser/api deploy --prod --legacy /deploy
RUN cp -r /src/s3-browser/api/dist /deploy/dist && \
    cp -r /src/s3-browser/api/drizzle /deploy/drizzle && \
    cp -r /src/s3-browser/web/dist /deploy/static

# ---- Production stage ----
FROM node:24-alpine

RUN apk add --no-cache tini

WORKDIR /app

COPY --from=build /deploy/ .

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV STATIC_DIR=/app/static
ENV PORT=3002

VOLUME /data
EXPOSE 3002

# Drop privileges: run as the unprivileged `node` user (uid 1000) from the base
# image. A fresh named volume mounted at /data inherits this ownership, so the
# SQLite database is writable without root.
RUN mkdir -p /data && chown -R node:node /app /data
USER node

# Container-level health check, so `docker run` users get it too (not just Compose).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/api/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
