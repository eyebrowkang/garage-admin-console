# Monorepo Restructure & S3 Browser Scaffold Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the existing Garage Admin Console into a monorepo with `apps/` + `packages/` layout, scaffold an S3 Browser sibling app, and connect them via Module Federation.

**Architecture:** Two apps (`apps/admin` and `apps/s3-browser`) share code via workspace packages (`packages/tsconfig`, `packages/ui`, `packages/auth`). The admin web app is the MF host; the s3-browser web app is the MF remote, exposing placeholder components. Each app has its own BFF (Express) and SPA (React/Vite).

**Tech Stack:** pnpm workspaces, TypeScript, Vite 7, React 19, Express 5, `@module-federation/vite`, Tailwind CSS 4, shadcn/ui, Drizzle ORM

**Spec:** `docs/specs/2026-03-10-monorepo-s3-browser-design.md`

---

## Chunk 1: Monorepo Directory Restructure

### Task 1: Create feature branch and move directories

**Files:**
- Move: `api/` → `apps/admin/api/`
- Move: `web/` → `apps/admin/web/`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (root)

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b feat/monorepo-s3-browser
```

- [ ] **Step 2: Create apps directory and move packages**

```bash
mkdir -p apps/admin
git mv api apps/admin/api
git mv web apps/admin/web
```

- [ ] **Step 3: Update pnpm-workspace.yaml**

Replace contents with:

```yaml
packages:
  - apps/admin/api
  - apps/admin/web

onlyBuiltDependencies:
  - bcrypt
  - esbuild
  - sqlite3
```

- [ ] **Step 4: Update package names in each package.json**

In `apps/admin/api/package.json`, change `"name": "api"` to `"name": "@garage-admin/admin-api"`.

In `apps/admin/web/package.json`, change `"name": "web"` to `"name": "@garage-admin/admin-web"`.

- [ ] **Step 5: Update root package.json scripts**

Replace the `"scripts"` block:

```json
{
  "scripts": {
    "build": "pnpm -C apps/admin/api build && pnpm -C apps/admin/web build",
    "dev": "pnpm -r --parallel --filter @garage-admin/admin-api --filter @garage-admin/admin-web dev",
    "dev:admin": "pnpm -r --parallel --filter @garage-admin/admin-api --filter @garage-admin/admin-web dev",
    "lint": "pnpm -C apps/admin/api lint && pnpm -C apps/admin/web lint",
    "lint:fix": "pnpm -C apps/admin/api lint:fix && pnpm -C apps/admin/web lint:fix",
    "format": "pnpm -C apps/admin/api format && pnpm -C apps/admin/web format",
    "format:check": "pnpm -C apps/admin/api format:check && pnpm -C apps/admin/web format:check",
    "test": "pnpm -C apps/admin/api test:run && pnpm -C apps/admin/web test:run",
    "typecheck": "pnpm -C apps/admin/api typecheck"
  }
}
```

- [ ] **Step 6: Update .prettierignore paths**

Replace `web/public/garage-admin-v2.json` with `apps/admin/web/public/garage-admin-v2.json`.

- [ ] **Step 7: Update .dockerignore paths**

Replace contents:

```
node_modules
apps/admin/api/node_modules
apps/admin/web/node_modules
apps/admin/api/dist
apps/admin/web/dist
*.db
*.db-journal
*.log
.env
apps/admin/api/.env
apps/admin/api/.env.*
!apps/admin/api/.env.example
.git
.DS_Store
coverage
test-results
playwright-report
screenshots
pnpm-debug.log*
.pnpm-store
docs
```

- [ ] **Step 8: Update playwright.config.ts webServer command**

The `pnpm dev` command still works (root script updated in step 5). The `testDir: './e2e'` still references root-level e2e directory, which hasn't moved. No changes needed for playwright.config.ts at this point.

- [ ] **Step 9: Run pnpm install and verify**

```bash
pnpm install
pnpm build
pnpm lint
pnpm test
```

All four commands must pass. If `pnpm build` fails, check for hardcoded relative path issues.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: move api and web into apps/admin directory

Restructure to monorepo layout with apps/ directory.
Package names updated to @garage-admin/admin-api and @garage-admin/admin-web.
All root scripts, .dockerignore, and .prettierignore updated for new paths."
```

### Task 2: Update CI/CD workflows

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Update ci.yml**

Replace the steps section (keep the setup steps unchanged, update only the command steps):

```yaml
      - name: Lint
        run: pnpm lint

      - name: Typecheck API
        run: pnpm -C apps/admin/api typecheck

      - name: Build web
        run: pnpm -C apps/admin/web build

      - name: Test API
        run: pnpm -C apps/admin/api test:run

      - name: Test web
        run: pnpm -C apps/admin/web test:run
```

- [ ] **Step 2: Update release.yml check job**

Same path changes as ci.yml — update the `Typecheck API`, `Build web`, `Test API`, and `Test web` steps to use `apps/admin/api` and `apps/admin/web` paths.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "ci: update workflow paths for monorepo structure"
```

### Task 3: Move Dockerfile to docker directory

**Files:**
- Move: `Dockerfile` → `docker/admin.Dockerfile`
- Modify: `docker/admin.Dockerfile` (update paths)
- Modify: `docker-compose.yml`
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Move Dockerfile**

```bash
mkdir -p docker
git mv Dockerfile docker/admin.Dockerfile
```

- [ ] **Step 2: Update paths inside docker/admin.Dockerfile**

Replace contents:

```dockerfile
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
```

- [ ] **Step 3: Update docker-compose.yml build context**

Add `build` section pointing to new Dockerfile location. Replace the `image` line with a `build` block (or keep image and add build as comment):

```yaml
services:
  garage-admin-console:
    image: ghcr.io/eyebrowkang/garage-admin-console:latest
    # To build locally:
    #   build:
    #     context: .
    #     dockerfile: docker/admin.Dockerfile
    ports:
      - '3001:3001'
    volumes:
      - garage-data:/data
    environment:
      - JWT_SECRET=change-me-to-a-random-string
      - ENCRYPTION_KEY=change-me-exactly-32-characters!
      - ADMIN_PASSWORD=change-me-admin-password
    restart: unless-stopped

volumes:
  garage-data:
```

- [ ] **Step 4: Update release.yml Docker build context**

In the `build-and-push` job, update the `Build and push Docker image` step:

```yaml
      - name: Build and push Docker image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/admin.Dockerfile
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 5: Verify Docker build**

```bash
docker build -f docker/admin.Dockerfile -t garage-admin-console:test .
```

If Docker is not available locally, skip this verification — CI will validate it.

- [ ] **Step 6: Commit**

```bash
git add docker/admin.Dockerfile docker-compose.yml .github/workflows/release.yml
git commit -m "refactor: move Dockerfile to docker/admin.Dockerfile

Update docker-compose.yml and release workflow to reference new location."
```

---

## Chunk 2: Shared Packages

### Task 4: Create @garage-admin/tsconfig

**Files:**
- Create: `packages/tsconfig/package.json`
- Create: `packages/tsconfig/base.json`
- Create: `packages/tsconfig/react.json`
- Create: `packages/tsconfig/node.json`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Create package structure**

```bash
mkdir -p packages/tsconfig
```

- [ ] **Step 2: Create packages/tsconfig/package.json**

```json
{
  "name": "@garage-admin/tsconfig",
  "version": "0.0.0",
  "private": true,
  "license": "AGPL-3.0-only",
  "files": ["*.json"]
}
```

- [ ] **Step 3: Create packages/tsconfig/base.json**

Common strict settings used by all packages:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "isolatedModules": true,
    "noUncheckedSideEffectImports": true
  }
}
```

Note: `erasableSyntaxOnly` is NOT in the base config because it's incompatible with `jsx: "react-jsx"`. It's added in react.json where it's safe (Vite handles JSX transform, so TS only needs to erase types).

- [ ] **Step 4: Create packages/tsconfig/react.json**

For React SPA packages (bundler mode, JSX, DOM):

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

- [ ] **Step 5: Create packages/tsconfig/node.json**

For Node.js/Express packages:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "rootDir": "./src",
    "outDir": "./dist",
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

Note: `rootDir`/`outDir` are set by convention — all Node.js workspace packages use `src/` and `dist/`. JSX is intentionally excluded; backend packages don't need it.

- [ ] **Step 6: Add to pnpm-workspace.yaml**

Add `packages/tsconfig` to the packages list:

```yaml
packages:
  - apps/admin/api
  - apps/admin/web
  - packages/tsconfig

onlyBuiltDependencies:
  - bcrypt
  - esbuild
  - sqlite3
```

- [ ] **Step 7: Run pnpm install**

```bash
pnpm install
```

- [ ] **Step 8: Commit**

```bash
git add packages/tsconfig pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: add @garage-admin/tsconfig shared package

Provides base, react, and node TypeScript configs for workspace packages."
```

### Task 5: Create @garage-admin/ui (minimal)

This package provides shared UI primitives. For now, it contains only the `cn()` utility and a few basic shadcn/ui components (Button, Card). The admin web continues using its own components — full extraction is deferred.

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/lib/utils.ts`
- Create: `packages/ui/src/components/button.tsx`
- Create: `packages/ui/src/components/card.tsx`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Create package structure**

```bash
mkdir -p packages/ui/src/{lib,components}
```

- [ ] **Step 2: Create packages/ui/package.json**

```json
{
  "name": "@garage-admin/ui",
  "version": "0.0.0",
  "private": true,
  "license": "AGPL-3.0-only",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./lib/utils": "./src/lib/utils.ts",
    "./components/*": "./src/components/*.tsx"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.4.0",
    "@radix-ui/react-slot": "^1.2.4"
  },
  "devDependencies": {
    "@garage-admin/tsconfig": "workspace:*",
    "@types/react": "^19.2.13",
    "@types/react-dom": "^19.2.3",
    "typescript": "~5.9.3"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 3: Create packages/ui/tsconfig.json**

```json
{
  "extends": "@garage-admin/tsconfig/react.json",
  "compilerOptions": {
    "types": []
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create packages/ui/src/lib/utils.ts**

Copy from `apps/admin/web/src/lib/utils.ts` (should contain the `cn()` function):

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Create packages/ui/src/components/button.tsx**

Copy from `apps/admin/web/src/components/ui/button.tsx`. Update the import path for `cn`:

Change `import { cn } from '@/lib/utils'` to `import { cn } from '../lib/utils.js'`.

- [ ] **Step 6: Create packages/ui/src/components/card.tsx**

Copy from `apps/admin/web/src/components/ui/card.tsx`. Update the import path for `cn`:

Change `import { cn } from '@/lib/utils'` to `import { cn } from '../lib/utils.js'`.

- [ ] **Step 7: Create packages/ui/src/index.ts**

```ts
export { cn } from './lib/utils.js';
export { Button, buttonVariants } from './components/button.js';
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from './components/card.js';
```

- [ ] **Step 8: Add to pnpm-workspace.yaml**

Add `packages/ui` to the packages list.

- [ ] **Step 9: Run pnpm install and verify**

```bash
pnpm install
cd packages/ui && npx tsc --noEmit
```

TypeScript should compile without errors.

- [ ] **Step 10: Commit**

```bash
git add packages/ui pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: add @garage-admin/ui shared package

Provides cn() utility and basic shadcn/ui components (Button, Card)
for use by workspace packages."
```

### Task 6: Create @garage-admin/auth (minimal)

Provides a configurable JWT auth middleware factory. Both apps can use it with their own secrets.

**Files:**
- Create: `packages/auth/package.json`
- Create: `packages/auth/tsconfig.json`
- Create: `packages/auth/src/index.ts`
- Create: `packages/auth/src/middleware.ts`
- Create: `packages/auth/src/types.ts`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Create package structure**

```bash
mkdir -p packages/auth/src
```

- [ ] **Step 2: Create packages/auth/package.json**

```json
{
  "name": "@garage-admin/auth",
  "version": "0.0.0",
  "private": true,
  "license": "AGPL-3.0-only",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "jsonwebtoken": "^9.0.3"
  },
  "devDependencies": {
    "@garage-admin/tsconfig": "workspace:*",
    "@types/express": "^5.0.6",
    "@types/jsonwebtoken": "^9.0.10",
    "typescript": "~5.9.3"
  },
  "peerDependencies": {
    "express": "^5.0.0"
  }
}
```

- [ ] **Step 3: Create packages/auth/tsconfig.json**

```json
{
  "extends": "@garage-admin/tsconfig/node.json",
  "include": ["src"]
}
```

- [ ] **Step 4: Create packages/auth/src/types.ts**

```ts
import type { Request } from 'express';

export interface AuthConfig {
  jwtSecret: string;
}

export interface JwtPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}
```

- [ ] **Step 5: Create packages/auth/src/middleware.ts**

```ts
import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthConfig, AuthenticatedRequest, JwtPayload } from './types.js';

export function createAuthMiddleware(config: AuthConfig) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
      req.user = decoded;
      next();
    } catch {
      res.status(403).json({ error: 'Invalid token' });
    }
  };
}
```

- [ ] **Step 6: Create packages/auth/src/index.ts**

```ts
export { createAuthMiddleware } from './middleware.js';
export type { AuthConfig, JwtPayload, AuthenticatedRequest } from './types.js';
```

- [ ] **Step 7: Add to pnpm-workspace.yaml**

Add `packages/auth` to the packages list.

- [ ] **Step 8: Run pnpm install and verify**

```bash
pnpm install
cd packages/auth && npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add packages/auth pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: add @garage-admin/auth shared package

Provides configurable JWT auth middleware factory.
Both admin and s3-browser apps can use it with their own JWT secrets."
```

- [ ] **Step 10: Update docker/admin.Dockerfile for shared packages**

The lockfile now references shared packages. The admin Dockerfile must copy their `package.json` files so `pnpm install --frozen-lockfile` succeeds. Update the dependency install section:

After the existing `COPY apps/admin/web/package.json apps/admin/web/` line, add:

```dockerfile
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/ui/package.json packages/ui/
COPY packages/auth/package.json packages/auth/
```

And after the `COPY apps/admin/web/ apps/admin/web/` line, add:

```dockerfile
COPY packages/ packages/
```

- [ ] **Step 11: Verify admin Docker build still works**

```bash
docker build -f docker/admin.Dockerfile -t garage-admin:test .
```

If Docker is not available locally, verify `pnpm build` still passes.

- [ ] **Step 12: Commit**

```bash
git add docker/admin.Dockerfile
git commit -m "fix: update admin Dockerfile for shared workspace packages"
```

---

## Chunk 3: S3 Browser Scaffold

### Task 7: Scaffold apps/s3-browser/api

A minimal Express BFF with health check and placeholder S3 route. No actual S3 operations — just the structure.

**Files:**
- Create: `apps/s3-browser/api/package.json`
- Create: `apps/s3-browser/api/tsconfig.json`
- Create: `apps/s3-browser/api/tsconfig.build.json`
- Create: `apps/s3-browser/api/src/index.ts`
- Create: `apps/s3-browser/api/src/app.ts`
- Create: `apps/s3-browser/api/src/config/env.ts`
- Create: `apps/s3-browser/api/src/routes/health.ts`
- Create: `apps/s3-browser/api/.env.example`
- Create: `apps/s3-browser/api/eslint.config.js`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (root)

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/s3-browser/api/src/{config,routes}
```

- [ ] **Step 2: Create apps/s3-browser/api/package.json**

```json
{
  "name": "@garage-admin/s3-api",
  "version": "0.0.0",
  "private": true,
  "description": "S3 Browser BFF API",
  "main": "dist/index.js",
  "type": "module",
  "license": "AGPL-3.0-only",
  "scripts": {
    "dev": "tsx --env-file=.env watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@garage-admin/auth": "workspace:*",
    "express": "^5.2.1",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@garage-admin/tsconfig": "workspace:*",
    "@eslint/js": "^9.39.2",
    "@types/express": "^5.0.6",
    "@types/node": "^25.2.1",
    "eslint": "^9.39.2",
    "eslint-config-prettier": "^10.1.8",
    "globals": "^17.3.0",
    "prettier": "^3.8.1",
    "tsx": "^4.21.0",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.54.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "extends": "@garage-admin/tsconfig/node.json",
  "include": ["src/**/*"],
  "exclude": ["node_modules", "**/*.spec.ts"]
}
```

- [ ] **Step 4: Create tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": false,
    "declarationMap": false
  },
  "exclude": ["node_modules", "src/test/**/*", "**/*.test.ts", "**/*.spec.ts"]
}
```

- [ ] **Step 5: Create eslint.config.js**

Copy from `apps/admin/api/eslint.config.js` (identical content — Node.js eslint config).

- [ ] **Step 6: Create apps/s3-browser/api/src/config/env.ts**

```ts
import { z } from 'zod/v4';

const envSchema = z.object({
  PORT: z.coerce.number().default(3002),
  JWT_SECRET: z.string().min(8),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 7: Create apps/s3-browser/api/src/routes/health.ts**

```ts
import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 's3-browser', timestamp: new Date() });
});

export default router;
```

- [ ] **Step 8: Create apps/s3-browser/api/src/app.ts**

```ts
import express, { type Express } from 'express';

import healthRouter from './routes/health.js';

export const app: Express = express();

app.use(express.json());

// Public routes
app.use('/api/health', healthRouter);

// Placeholder: S3 proxy routes will be added here
// app.use('/api/s3', authenticateToken, s3Router);
```

- [ ] **Step 9: Create apps/s3-browser/api/src/index.ts**

```ts
import path from 'path';
import express from 'express';
import { env } from './config/env.js';
import { app } from './app.js';

// Serve static frontend files when STATIC_DIR is configured
const staticDir = process.env.STATIC_DIR;
if (staticDir) {
  const resolved = path.resolve(staticDir);
  app.use(express.static(resolved));

  // SPA fallback
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
      res.sendFile(path.join(resolved, 'index.html'));
    } else {
      next();
    }
  });
}

app.listen(env.PORT, () => {
  console.log(`S3 Browser API running on port ${env.PORT}`);
});
```

- [ ] **Step 10: Create .env.example**

```
PORT=3002
JWT_SECRET=change-me-to-a-random-string
```

- [ ] **Step 11: Update pnpm-workspace.yaml**

Add `apps/s3-browser/api` to the packages list.

- [ ] **Step 12: Update root package.json scripts**

Add s3-browser scripts alongside existing ones:

```json
{
  "scripts": {
    "build": "pnpm -C apps/admin/api build && pnpm -C apps/admin/web build && pnpm -C apps/s3-browser/api build && pnpm -C apps/s3-browser/web build",
    "dev": "pnpm -r --parallel dev",
    "dev:admin": "pnpm -r --parallel --filter @garage-admin/admin-api --filter @garage-admin/admin-web dev",
    "dev:s3": "pnpm -r --parallel --filter @garage-admin/s3-api --filter @garage-admin/s3-web dev",
    "lint": "pnpm -r lint",
    "lint:fix": "pnpm -r lint:fix",
    "format": "pnpm -r format",
    "format:check": "pnpm -r format:check",
    "test": "pnpm -r test:run",
    "typecheck": "pnpm -r typecheck"
  }
}
```

Note: use `pnpm -r` (recursive) instead of listing each package — this simplifies maintenance as packages are added.

**Important**: Only replace the `"scripts"` field. Preserve all other fields (`name`, `version`, `packageManager`, `engines`, `devDependencies`, `pnpm.overrides`, etc.).

- [ ] **Step 13: Run pnpm install and verify**

```bash
pnpm install
pnpm -C apps/s3-browser/api typecheck
pnpm -C apps/s3-browser/api build
```

- [ ] **Step 14: Commit**

```bash
git add apps/s3-browser/api pnpm-workspace.yaml pnpm-lock.yaml package.json
git commit -m "feat: scaffold s3-browser api

Minimal Express BFF with health check endpoint.
Uses @garage-admin/auth and @garage-admin/tsconfig shared packages."
```

### Task 8: Scaffold apps/s3-browser/web

A minimal React SPA with placeholder pages. This is the MF remote that will expose components.

**Files:**
- Create: `apps/s3-browser/web/package.json`
- Create: `apps/s3-browser/web/tsconfig.json`
- Create: `apps/s3-browser/web/tsconfig.app.json`
- Create: `apps/s3-browser/web/tsconfig.node.json`
- Create: `apps/s3-browser/web/vite.config.ts`
- Create: `apps/s3-browser/web/eslint.config.js`
- Create: `apps/s3-browser/web/index.html`
- Create: `apps/s3-browser/web/src/main.tsx`
- Create: `apps/s3-browser/web/src/App.tsx`
- Create: `apps/s3-browser/web/src/index.css`
- Create: `apps/s3-browser/web/src/pages/Home.tsx`
- Create: `apps/s3-browser/web/src/components/ObjectBrowser.tsx`
- Create: `apps/s3-browser/web/src/providers/S3EmbedProvider.tsx`
- Modify: `pnpm-workspace.yaml`
- Modify: `.dockerignore`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/s3-browser/web/src/{pages,components,providers,lib}
```

- [ ] **Step 2: Create apps/s3-browser/web/package.json**

```json
{
  "name": "@garage-admin/s3-web",
  "private": true,
  "version": "0.0.0",
  "license": "AGPL-3.0-only",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5174",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc -b",
    "test": "vitest --passWithNoTests",
    "test:run": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@garage-admin/ui": "workspace:*",
    "@tanstack/react-query": "^5.90.20",
    "lucide-react": "^0.563.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-router-dom": "^7.13.0"
  },
  "devDependencies": {
    "@garage-admin/tsconfig": "workspace:*",
    "@eslint/js": "^9.39.2",
    "@tailwindcss/vite": "^4.1.18",
    "@types/react": "^19.2.13",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.3",
    "eslint": "^9.39.2",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.5.0",
    "globals": "^17.3.0",
    "prettier": "^3.8.1",
    "tailwindcss": "^4.1.18",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.54.0",
    "vite": "^7.3.1",
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 3: Create TypeScript configs**

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`tsconfig.app.json`:

```json
{
  "extends": "@garage-admin/tsconfig/react.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create vite.config.ts**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 5: Create eslint.config.js**

Copy from `apps/admin/web/eslint.config.js` (identical content — React eslint config).

- [ ] **Step 6: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>S3 Browser</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create src/index.css**

```css
@import 'tailwindcss';
```

- [ ] **Step 8: Create src/providers/S3EmbedProvider.tsx**

This is the embed context that the host app will wrap around remote components:

```tsx
import { createContext, useContext, type ReactNode } from 'react';

export interface S3EmbedConfig {
  apiBase: string;
  bucket?: string;
  readonly?: boolean;
}

const S3EmbedContext = createContext<S3EmbedConfig | null>(null);

export function useS3EmbedContext(): S3EmbedConfig | null {
  return useContext(S3EmbedContext);
}

export function S3EmbedProvider({
  config,
  children,
}: {
  config: S3EmbedConfig;
  children: ReactNode;
}) {
  return <S3EmbedContext.Provider value={config}>{children}</S3EmbedContext.Provider>;
}
```

- [ ] **Step 9: Create src/components/ObjectBrowser.tsx**

Placeholder component that will be exposed via Module Federation:

```tsx
import { useS3EmbedContext } from '../providers/S3EmbedProvider';

export function ObjectBrowser({ bucket }: { bucket?: string }) {
  const embedConfig = useS3EmbedContext();
  const isEmbedded = embedConfig !== null;
  const activeBucket = bucket ?? embedConfig?.bucket ?? 'none';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold">Object Browser</h2>
      <div className="text-sm text-gray-500">
        <p>Bucket: <span className="font-mono">{activeBucket}</span></p>
        <p>Mode: {isEmbedded ? 'Embedded' : 'Standalone'}</p>
        {isEmbedded && <p>API Base: <span className="font-mono">{embedConfig.apiBase}</span></p>}
      </div>
      <p className="mt-4 text-gray-400">Object list and management UI coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 10: Create src/components/BucketExplorer.tsx**

Placeholder component exposed via MF for bucket listing + object browsing:

```tsx
import { useS3EmbedContext } from '../providers/S3EmbedProvider';
import { ObjectBrowser } from './ObjectBrowser';

export function BucketExplorer() {
  const embedConfig = useS3EmbedContext();
  const isEmbedded = embedConfig !== null;

  return (
    <div className="space-y-6">
      {!isEmbedded && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Buckets</h2>
          <p className="text-gray-400">Bucket list coming soon.</p>
        </div>
      )}
      <ObjectBrowser bucket={embedConfig?.bucket} />
    </div>
  );
}
```

- [ ] **Step 11: Create src/pages/Home.tsx (renumbered)**

```tsx
import { ObjectBrowser } from '../components/ObjectBrowser';

export function Home() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-2xl font-bold">S3 Browser</h1>
        <p className="mb-8 text-gray-500">
          General-purpose S3-compatible object storage browser.
        </p>

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Connections</h2>
          <p className="text-gray-400">Connection management coming soon.</p>
        </div>

        <ObjectBrowser bucket="example-bucket" />
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Create src/App.tsx**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

- [ ] **Step 12: Create src/main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 13: Update pnpm-workspace.yaml and .dockerignore**

Add `apps/s3-browser/web` to pnpm-workspace.yaml.

Add to `.dockerignore`:

```
apps/s3-browser/api/node_modules
apps/s3-browser/web/node_modules
apps/s3-browser/api/dist
apps/s3-browser/web/dist
```

- [ ] **Step 14: Run pnpm install and verify**

```bash
pnpm install
pnpm -C apps/s3-browser/web typecheck
pnpm -C apps/s3-browser/web build
```

Also verify that `pnpm dev:s3` starts both the API (port 3002) and web (port 5174).

- [ ] **Step 15: Commit**

```bash
git add apps/s3-browser/web pnpm-workspace.yaml pnpm-lock.yaml .dockerignore
git commit -m "feat: scaffold s3-browser web

Minimal React SPA with placeholder Home page, ObjectBrowser component,
and S3EmbedProvider for embedded mode context detection.
Uses @garage-admin/ui and @garage-admin/tsconfig shared packages."
```

---

## Chunk 4: Module Federation & Docker

### Task 9: Configure Module Federation

Set up the s3-browser web as MF remote and admin web as MF host. Verify that admin can load the ObjectBrowser placeholder from s3-browser at dev time.

**Files:**
- Modify: `apps/s3-browser/web/package.json` (add MF dependency)
- Modify: `apps/s3-browser/web/vite.config.ts` (add MF remote config)
- Modify: `apps/admin/web/package.json` (add MF dependency)
- Modify: `apps/admin/web/vite.config.ts` (add MF host config)
- Create: `apps/admin/web/src/types/s3-browser.d.ts` (type declarations for remote)
- Modify: `apps/admin/web/src/App.tsx` (add a route to test MF loading)

- [ ] **Step 1: Install @module-federation/vite in both web packages**

```bash
pnpm -C apps/s3-browser/web add -D @module-federation/vite
pnpm -C apps/admin/web add -D @module-federation/vite
```

If `@module-federation/vite` has compatibility issues with Vite 7, fall back to `@originjs/vite-plugin-federation` and adjust the import/config syntax accordingly (the API is similar but the import path differs).

- [ ] **Step 2: Configure s3-browser web as MF remote**

Update `apps/s3-browser/web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    federation({
      name: 's3_browser',
      filename: 'remoteEntry.js',
      exposes: {
        './ObjectBrowser': './src/components/ObjectBrowser.tsx',
        './BucketExplorer': './src/components/BucketExplorer.tsx',
        './S3EmbedProvider': './src/providers/S3EmbedProvider.tsx',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
        'react-router-dom': { singleton: true, requiredVersion: '^7.0.0' },
        '@tanstack/react-query': { singleton: true, requiredVersion: '^5.0.0' },
      },
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
  },
  server: {
    port: 5174,
    origin: 'http://localhost:5174',
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Configure admin web as MF host**

Update `apps/admin/web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    federation({
      name: 'admin_console',
      remotes: {
        s3_browser: {
          type: 'module',
          name: 's3_browser',
          entry: 'http://localhost:5174/remoteEntry.js',
          entryGlobalName: 's3_browser',
          shareScope: 'default',
        },
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
        'react-router-dom': { singleton: true, requiredVersion: '^7.0.0' },
        '@tanstack/react-query': { singleton: true, requiredVersion: '^5.0.0' },
      },
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          // Only split echarts (large); MF handles shared deps (react, router, query)
          if (id.includes('echarts')) {
            return 'vendor-echarts';
          }
          return 'vendor';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

Note: the `S3_BROWSER_REMOTE_URL` environment variable can be used for production to point to the deployed remote. For now, hardcode the dev URL.

- [ ] **Step 4: Create type declarations for remote module**

Create `apps/admin/web/src/types/s3-browser.d.ts`:

```ts
declare module 's3_browser/ObjectBrowser' {
  import type { ComponentType } from 'react';
  const ObjectBrowser: ComponentType<{ bucket?: string }>;
  export { ObjectBrowser };
}

declare module 's3_browser/BucketExplorer' {
  import type { ComponentType } from 'react';
  const BucketExplorer: ComponentType;
  export { BucketExplorer };
}

declare module 's3_browser/S3EmbedProvider' {
  import type { ComponentType, ReactNode } from 'react';
  interface S3EmbedConfig {
    apiBase: string;
    bucket?: string;
    readonly?: boolean;
  }
  const S3EmbedProvider: ComponentType<{ config: S3EmbedConfig; children: ReactNode }>;
  export { S3EmbedProvider };
  export function useS3EmbedContext(): S3EmbedConfig | null;
}
```

- [ ] **Step 5: Add an MF test route in admin web**

Add a temporary test page to verify MF loading. Create `apps/admin/web/src/pages/S3BrowserTest.tsx`:

```tsx
import React, { Suspense } from 'react';
import { PageLoadingState } from '@/components/cluster/PageLoadingState';

const RemoteObjectBrowser = React.lazy(() =>
  import('s3_browser/ObjectBrowser').then((m) => ({ default: m.ObjectBrowser })),
);

export function S3BrowserTest() {
  return (
    <div className="p-8">
      <h1 className="mb-4 text-xl font-bold">Module Federation Test</h1>
      <Suspense fallback={<PageLoadingState label="Loading S3 Browser component..." />}>
        <RemoteObjectBrowser bucket="test-bucket" />
      </Suspense>
    </div>
  );
}
```

Add a route in `apps/admin/web/src/App.tsx` inside the protected routes:

```tsx
const S3BrowserTest = React.lazy(() =>
  import('./pages/S3BrowserTest').then((m) => ({ default: m.S3BrowserTest })),
);
```

Add inside the `<Route path="/" ...>` block:

```tsx
<Route path="s3-test" element={<S3BrowserTest />} />
```

- [ ] **Step 6: Verify Module Federation works**

Start all dev servers:

```bash
pnpm dev
```

1. Open `http://localhost:5174` — S3 Browser standalone should show the Home page
2. Open `http://localhost:5173/s3-test` — Admin console should load the ObjectBrowser component from the remote

If the MF remote fails to load, check:
- Both dev servers are running
- The remote's `remoteEntry.js` is accessible at `http://localhost:5174/remoteEntry.js`
- No CORS errors in the browser console
- Shared dependency versions match between host and remote

- [ ] **Step 7: Commit**

```bash
git add apps/s3-browser/web apps/admin/web pnpm-lock.yaml
git commit -m "feat: configure Module Federation between admin and s3-browser

Admin web (host) loads ObjectBrowser component from s3-browser web (remote).
Shared singletons: react, react-dom, react-router-dom.
Test route at /s3-test verifies MF integration."
```

### Task 10: Docker files for all deployment modes

**Files:**
- Create: `docker/s3-browser.Dockerfile`
- Create: `docker/combined.Dockerfile`

- [ ] **Step 1: Create docker/s3-browser.Dockerfile**

Standalone S3 Browser deployment:

```dockerfile
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
```

- [ ] **Step 2: Create docker/combined.Dockerfile**

Combined deployment — admin console with embedded S3 browser:

```dockerfile
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

# Build s3-browser first (remote assets needed by host)
RUN pnpm -C apps/s3-browser/api build
RUN pnpm -C apps/s3-browser/web build

# Build admin
RUN pnpm -C apps/admin/api build
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
```

- [ ] **Step 3: Verify Docker builds (if Docker is available)**

```bash
docker build -f docker/admin.Dockerfile -t garage-admin:test .
docker build -f docker/s3-browser.Dockerfile -t garage-s3:test .
docker build -f docker/combined.Dockerfile -t garage-combined:test .
```

If Docker is not available locally, skip — CI will validate.

- [ ] **Step 4: Commit**

```bash
git add docker/s3-browser.Dockerfile docker/combined.Dockerfile
git commit -m "feat: add Docker files for s3-browser and combined deployment

Three deployment modes:
- docker/admin.Dockerfile: standalone admin console
- docker/s3-browser.Dockerfile: standalone S3 browser
- docker/combined.Dockerfile: both apps in one image"
```

### Task 11: Update CI workflows for s3-browser and add s3-browser static serving

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `apps/admin/api/src/index.ts`

- [ ] **Step 1: Add s3-browser steps to ci.yml**

Add after the existing steps:

```yaml
      - name: Typecheck S3 API
        run: pnpm -C apps/s3-browser/api typecheck

      - name: Build S3 web
        run: pnpm -C apps/s3-browser/web build

      - name: Test S3 web
        run: pnpm -C apps/s3-browser/web test:run
```

Apply the same additions to the `check` job in `release.yml`.

- [ ] **Step 2: Add TODO for s3-browser static serving in combined deployment**

In `apps/admin/api/src/index.ts`, after the existing `STATIC_DIR` block, add:

```ts
// TODO: Serve S3 Browser remote assets in combined deployment
// const s3BrowserDir = process.env.S3_BROWSER_STATIC_DIR;
// if (s3BrowserDir) {
//   app.use('/s3-browser', express.static(path.resolve(s3BrowserDir)));
// }
```

This is deferred to the full MF production integration phase but documented as a known requirement.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/release.yml apps/admin/api/src/index.ts
git commit -m "ci: add s3-browser to CI workflows

Also adds TODO for s3-browser static serving in combined deployment mode."
```

### Task 12: Update CLAUDE.md and final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Update the project documentation to reflect the new monorepo structure. Key sections to update:

- **Commands**: Update all `pnpm -C api` / `pnpm -C web` references to new paths. Add s3-browser commands.
- **Architecture**: Add the s3-browser app description. Update the monorepo package list.
- **Directory structure**: Replace the two-package description with the apps/ + packages/ layout.
- **Docker**: Update Dockerfile references to the docker/ directory.

- [ ] **Step 2: Run full verification**

```bash
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

All commands must pass.

- [ ] **Step 3: Verify dev mode**

```bash
pnpm dev
```

Verify:
1. Admin API on `http://localhost:3001/api/health` returns OK
2. Admin Web on `http://localhost:5173` shows the dashboard (after login)
3. S3 Browser API on `http://localhost:3002/api/health` returns OK
4. S3 Browser Web on `http://localhost:5174` shows the placeholder home page
5. MF test route on `http://localhost:5173/s3-test` loads the ObjectBrowser from the remote

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for monorepo structure"
```

- [ ] **Step 5: Push branch and create PR**

```bash
git push -u origin feat/monorepo-s3-browser
```

Create a PR against `main` with a summary of all changes.
