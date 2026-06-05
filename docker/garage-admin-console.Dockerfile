# ---- Build stage ----
FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /src

# Install dependencies (cached layer) — copy every package.json needed by this
# image so pnpm can resolve the workspace graph before sources land.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY garage-admin-console/api/package.json garage-admin-console/api/
COPY garage-admin-console/web/package.json garage-admin-console/web/
COPY packages/bucket-api-server/package.json packages/bucket-api-server/
COPY packages/crypto/package.json packages/crypto/
COPY packages/server-config/package.json packages/server-config/
COPY packages/tokens/package.json packages/tokens/
COPY packages/ui/package.json packages/ui/
COPY packages/web-shared/package.json packages/web-shared/
RUN pnpm install --frozen-lockfile

# Copy only the shared package sources used by this image. Keeping this set in
# sync with the package.json files copied above prevents pnpm from discovering
# a new workspace after install and auto-running another install before scripts.
COPY packages/bucket-api-server/ packages/bucket-api-server/
COPY packages/crypto/ packages/crypto/
COPY packages/server-config/ packages/server-config/
COPY packages/tokens/ packages/tokens/
COPY packages/ui/ packages/ui/
COPY packages/web-shared/ packages/web-shared/
COPY garage-admin-console/api/ garage-admin-console/api/
COPY garage-admin-console/web/ garage-admin-console/web/

# Build shared packages first — @garage-admin/web resolves @garage/{ui,tokens}
# via their compiled dist/ outputs.
RUN pnpm build:packages

# Build API (TypeScript → JavaScript)
RUN pnpm -C garage-admin-console/api build

# Build frontend (uses default /api prefix, matching the Express route mount)
RUN pnpm -C garage-admin-console/web build

# Deploy API package with production dependencies only
RUN pnpm --filter @garage-admin/api deploy --prod --legacy /deploy

# Copy build artifacts into the deployed package
RUN cp -r /src/garage-admin-console/api/dist /deploy/dist && \
    cp -r /src/garage-admin-console/api/drizzle /deploy/drizzle

# ---- Production stage ----
FROM node:24-alpine

RUN apk add --no-cache tini

WORKDIR /app

# Copy deployed API (includes node_modules with production deps)
COPY --from=build /deploy/ .

# Copy frontend build
COPY --from=build /src/garage-admin-console/web/dist/ /app/static/

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV STATIC_DIR=/app/static
ENV PORT=3001

VOLUME /data
EXPOSE 3001

# Drop privileges: run as the unprivileged `node` user (uid 1000) from the base
# image. A fresh named volume mounted at /data inherits this ownership, so the
# SQLite database is writable without root.
RUN mkdir -p /data && chown -R node:node /app /data
USER node

# Container-level health check, so `docker run` users get it too (not just Compose).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null 2>&1 || exit 1

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
