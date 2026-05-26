# ---- Build stage ----
FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /src

# Install dependencies (cached layer) — copy every workspace's package.json
# so pnpm can resolve the workspace graph before sources land.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY garage-admin-console/api/package.json garage-admin-console/api/
COPY garage-admin-console/web/package.json garage-admin-console/web/
COPY packages/tokens/package.json packages/tokens/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ packages/
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

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
