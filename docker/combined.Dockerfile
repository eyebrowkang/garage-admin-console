# ---- Build stage ----
FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /src

# Install all dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/api/package.json apps/admin/api/
COPY apps/admin/web/package.json apps/admin/web/
COPY apps/s3-browser/api/package.json apps/s3-browser/api/
COPY apps/s3-browser/web/package.json apps/s3-browser/web/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/ui/package.json packages/ui/
COPY packages/auth/package.json packages/auth/
RUN pnpm install --frozen-lockfile

# Copy all source
COPY packages/ packages/
COPY apps/ apps/

ARG VITE_S3_BROWSER_REMOTE_ENTRY

# Build s3-browser first (remote assets needed by host)
RUN pnpm -C apps/s3-browser/api build
# Set base path so MF assets reference /s3-browser/ prefix (matches static serving path)
RUN MF_PROXY_BASE=/s3-browser/ pnpm -C apps/s3-browser/web build

# Build admin
RUN pnpm -C apps/admin/api build
ENV VITE_S3_BROWSER_REMOTE_ENTRY=${VITE_S3_BROWSER_REMOTE_ENTRY}
RUN pnpm -C apps/admin/web build

# Deploy admin API with production deps
RUN pnpm --filter @garage-admin/admin-api deploy --prod --legacy /deploy

RUN cp -r /src/apps/admin/api/dist /deploy/dist && \
    cp -r /src/apps/admin/api/drizzle /deploy/drizzle

# ---- Production stage ----
FROM node:24-alpine

RUN apk add --no-cache tini

WORKDIR /app

COPY --from=build /deploy/ .

# Admin SPA
COPY --from=build /src/apps/admin/web/dist/ /app/static/

# S3 Browser remote assets (remoteEntry.js etc.)
COPY --from=build /src/apps/s3-browser/web/dist/ /app/static/s3-browser/

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV STATIC_DIR=/app/static
ENV S3_BROWSER_STATIC_DIR=/app/static/s3-browser
ENV PORT=3001

VOLUME /data
EXPOSE 3001

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
