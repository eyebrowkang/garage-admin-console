# ---- Build stage ----
FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /src

# Install dependencies (cached layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/api/package.json apps/admin/api/
COPY apps/admin/web/package.json apps/admin/web/
RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/admin/api/ apps/admin/api/
COPY apps/admin/web/ apps/admin/web/

# Build API (TypeScript → JavaScript)
RUN pnpm -C apps/admin/api build

# Build frontend (uses default /api prefix, matching the Express route mount)
RUN pnpm -C apps/admin/web build

# Deploy API package with production dependencies only
RUN pnpm --filter @garage-admin/admin-api deploy --prod --legacy /deploy

# Copy build artifacts into the deployed package
RUN cp -r /src/apps/admin/api/dist /deploy/dist && \
    cp -r /src/apps/admin/api/drizzle /deploy/drizzle

# ---- Production stage ----
FROM node:24-alpine

RUN apk add --no-cache tini

WORKDIR /app

# Copy deployed API (includes node_modules with production deps)
COPY --from=build /deploy/ .

# Copy frontend build
COPY --from=build /src/apps/admin/web/dist/ /app/static/

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV STATIC_DIR=/app/static
ENV PORT=3001

VOLUME /data
EXPOSE 3001

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
