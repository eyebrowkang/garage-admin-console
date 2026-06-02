# @garage/server-config

Shared backend helpers for both BFFs — they differ only in their default port.

| Export | Purpose |
| --- | --- |
| `loadEnv(defaultPort)` | Validate `process.env` (JWT / admin password / encryption key / port / log level) → `ServerEnv`; throws fast on anything missing or invalid |
| `getParam(params, name)` | Read one Express route param, tolerating the `string[]` shape |
| `createAuthenticateToken(jwtSecret)` | JWT-verify middleware |
| `createAuthRouter({ adminPassword, jwtSecret })` | `POST /login` → JWT |
| `createServiceLoggers`, `createHttpLogMiddleware` | pino + morgan wiring |
| `createMultipartAwareJsonParser` | JSON body parser that skips `multipart/form-data` (so busboy can stream) |
| `createLibsqlDb`, `getMigrationsFolder`, `runLibsqlMigrations` | LibSQL client + Drizzle migration helpers |

Validation logic is intentionally side-effect-free (callers load their own
`.env` first), so `loadEnv` is trivially unit-testable.
