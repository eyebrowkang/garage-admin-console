# @garage/web-shared

Shared **non-UI** web logic for both apps — pure functions + client factories,
no React components (those live in [`@garage/ui`](../ui/)).

| Export | Purpose |
| --- | --- |
| `createApiClient({ baseURL, tokenKey, onUnauthorized })` | axios instance with JWT injection + 401/403 routing, plus `readStoredToken` / `writeStoredToken` |
| `createAppQueryClient()` | TanStack Query client (30s stale, no refetch-on-focus, retries skip 401/403) |
| `getApiErrorMessage(err, fallback?)` | Normalize any axios error / `Error` / unknown value into a user-facing string |
| `formatBytes`, `formatDate`, `formatDateTime`, `formatRelativeSeconds`, `formatShortId`, `formatNum`, `basename`, `fileKind`, `isTextLikeKind` | display formatters, pinned to `en-US` |

Put new shared non-UI logic here — never copy a util into both web apps.
