import { QueryClient } from '@tanstack/react-query';

/**
 * The standalone TanStack Query client shared by both apps' entry points
 * (admin `App.tsx`, s3-browser `bootstrap.tsx`). 30s stale window, no
 * refetch-on-focus, and retries that skip auth failures (401/403) so a
 * logged-out user isn't hammered with three retries per query.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error && typeof error === 'object' && 'response' in error) {
            const status = (error as { response?: { status?: number } }).response?.status;
            if (status === 401 || status === 403) return false;
          }
          return failureCount < 3;
        },
      },
    },
  });
}
