# ---- Build stage ----
FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /src

# Install dependencies (cached layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile

# Copy source
COPY api/ api/
COPY web/ web/

# Build API (TypeScript → JavaScript)
RUN pnpm -C api build

# Build frontend with empty API prefix (served from same origin in production)
RUN VITE_API_BASE_URL=/ pnpm -C web build

# Deploy API package with production dependencies only
RUN pnpm --filter api deploy --prod --legacy /deploy

# Copy build artifacts into the deployed package
RUN cp -r /src/api/dist /deploy/dist && \
    cp -r /src/api/drizzle /deploy/drizzle

# ---- Production stage ----
FROM node:24-alpine

RUN apk add --no-cache tini

WORKDIR /app

# Copy deployed API (includes node_modules with production deps)
COPY --from=build /deploy/ .

# Copy frontend build
COPY --from=build /src/web/dist/ /app/static/

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV STATIC_DIR=/app/static
ENV PORT=3001

VOLUME /data
EXPOSE 3001

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
