# garage-admin-all — the "complete" single image: the Admin Console (API + SPA)
# with the S3 Browser Module Federation remote bundled in and served same-origin
# at /s3-browser. No separate S3 Browser container or proxy hop is needed; the
# embedded FileBrowser's data still flows through the Admin BFF's Bucket API.

# ---- Build stage ----
FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /src

# Install dependencies (cached layer) — every package.json this image builds.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY garage-admin-console/api/package.json garage-admin-console/api/
COPY garage-admin-console/web/package.json garage-admin-console/web/
COPY s3-browser/web/package.json s3-browser/web/
COPY packages/bucket-api-server/package.json packages/bucket-api-server/
COPY packages/crypto/package.json packages/crypto/
COPY packages/server-config/package.json packages/server-config/
COPY packages/tokens/package.json packages/tokens/
COPY packages/ui/package.json packages/ui/
COPY packages/web-shared/package.json packages/web-shared/
RUN pnpm install --frozen-lockfile

# Sources (kept in sync with the package.json set copied above).
COPY packages/bucket-api-server/ packages/bucket-api-server/
COPY packages/crypto/ packages/crypto/
COPY packages/server-config/ packages/server-config/
COPY packages/tokens/ packages/tokens/
COPY packages/ui/ packages/ui/
COPY packages/web-shared/ packages/web-shared/
COPY garage-admin-console/api/ garage-admin-console/api/
COPY garage-admin-console/web/ garage-admin-console/web/
COPY s3-browser/web/ s3-browser/web/

# Build shared packages, then the Admin API + SPA and the S3 Browser MF remote.
RUN pnpm build:packages
RUN pnpm -C garage-admin-console/api build
RUN pnpm -C garage-admin-console/web build
RUN pnpm -C s3-browser/web build

# Deploy the Admin API with production dependencies only.
RUN pnpm --filter @garage-admin/api deploy --prod --legacy /deploy
RUN cp -r /src/garage-admin-console/api/dist /deploy/dist && \
    cp -r /src/garage-admin-console/api/drizzle /deploy/drizzle

# ---- Production stage ----
FROM node:24-alpine

RUN apk add --no-cache tini

WORKDIR /app

# Deployed API (includes node_modules with production deps).
COPY --from=build /deploy/ .

# Admin SPA, plus the S3 Browser MF remote served same-origin at /s3-browser.
COPY --from=build /src/garage-admin-console/web/dist/ /app/static/
COPY --from=build /src/s3-browser/web/dist/ /app/s3-browser-static/

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV STATIC_DIR=/app/static
# Same-origin S3 Browser remote — no proxy target needed.
ENV S3_BROWSER_STATIC_DIR=/app/s3-browser-static
ENV S3_BROWSER_MF_URL=/s3-browser/mf-manifest.json
ENV PORT=3001

VOLUME /data
EXPOSE 3001

# Drop privileges; a fresh named volume at /data inherits node's ownership.
RUN mkdir -p /data && chown -R node:node /app /data
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null 2>&1 || exit 1

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
