# ---- Build stage ----
FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /src

# Install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/s3-browser/api/package.json apps/s3-browser/api/
COPY apps/s3-browser/web/package.json apps/s3-browser/web/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/ui/package.json packages/ui/
COPY packages/auth/package.json packages/auth/
RUN pnpm install --frozen-lockfile

# Copy shared packages source
COPY packages/ packages/

# Copy s3-browser source
COPY apps/s3-browser/ apps/s3-browser/

# Build
RUN pnpm -C apps/s3-browser/api build
RUN pnpm -C apps/s3-browser/web build

# Deploy API with production deps
RUN pnpm --filter @garage-admin/s3-api deploy --prod --legacy /deploy

# Copy build artifacts
RUN cp -r /src/apps/s3-browser/api/dist /deploy/dist

# ---- Production stage ----
FROM node:24-alpine

RUN apk add --no-cache tini

WORKDIR /app

COPY --from=build /deploy/ .
COPY --from=build /src/apps/s3-browser/web/dist/ /app/static/

ENV NODE_ENV=production
ENV STATIC_DIR=/app/static
ENV PORT=3002

EXPOSE 3002

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
