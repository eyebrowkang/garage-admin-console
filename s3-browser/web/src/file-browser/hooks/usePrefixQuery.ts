import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';
import { useMemo } from 'react';
import type { ListResult } from '@/lib/types';
import type { ListItem } from '../types';

export const QUERY_PREFIX = 'prefix';
export const TREE_QUERY_PREFIX = 'tree-prefix';

export function prefixQueryKey(baseUrl: string, prefix: string) {
  return [QUERY_PREFIX, baseUrl, prefix] as const;
}

export function treePrefixQueryKey(baseUrl: string, prefix: string) {
  return [TREE_QUERY_PREFIX, baseUrl, prefix] as const;
}

export function fetchPrefixPage(
  http: AxiosInstance,
  prefix: string,
  continuationToken?: string,
  maxKeys = 1000,
  delimiter = '/',
): Promise<ListResult> {
  return http
    .get<ListResult>('/list', {
      params: {
        prefix,
        delimiter,
        maxKeys,
        ...(continuationToken ? { continuationToken } : {}),
      },
    })
    .then((r) => r.data);
}

export async function fetchPrefixPages(
  http: AxiosInstance,
  prefix: string,
  delimiter = '/',
): Promise<ListResult[]> {
  const pages: ListResult[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await fetchPrefixPage(http, prefix, continuationToken, 1000, delimiter);
    pages.push(page);
    continuationToken = page.nextContinuationToken;
  } while (continuationToken);
  return pages;
}

export function pagesToItems(pages: ListResult[], prefix: string): ListItem[] {
  const seenPrefixes = new Set<string>();
  const seenKeys = new Set<string>();
  const out: ListItem[] = [];

  for (const page of pages) {
    for (const p of page.prefixes) {
      if (seenPrefixes.has(p)) continue;
      seenPrefixes.add(p);
      const inner = p.startsWith(prefix) ? p.slice(prefix.length) : p;
      const name = inner.replace(/\/$/, '');
      if (!name) continue;
      out.push({ type: 'folder', name, prefix: p });
    }
    for (const o of page.objects) {
      if (seenKeys.has(o.key)) continue;
      seenKeys.add(o.key);
      const inner = o.key.startsWith(prefix) ? o.key.slice(prefix.length) : o.key;
      if (!inner || inner.endsWith('/') || inner === '.keep') continue;
      out.push({ type: 'file', name: inner, key: o.key, object: o });
    }
  }

  return out;
}

export interface UsePrefixQueryResult {
  items: ListItem[];
  allFolders: string[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasMore: boolean;
  loadMore: () => void;
  error: unknown;
  refetch: () => void;
  dataUpdatedAt: number;
}

export function usePrefixQuery(
  http: AxiosInstance,
  baseUrl: string,
  prefix: string,
): UsePrefixQueryResult {
  const query = useInfiniteQuery<
    ListResult,
    Error,
    InfiniteData<ListResult>,
    readonly [string, string, string],
    string | undefined
  >({
    queryKey: prefixQueryKey(baseUrl, prefix),
    queryFn: ({ pageParam }) => fetchPrefixPage(http, prefix, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextContinuationToken ?? undefined,
    initialPageParam: undefined,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const items = useMemo<ListItem[]>(() => {
    const pages = query.data?.pages ?? [];
    if (pages.length === 0) return [];
    return pagesToItems(pages, prefix);
  }, [query.data?.pages, prefix]);

  const allFolders = useMemo<string[]>(() => {
    const pages = query.data?.pages ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const page of pages) {
      for (const p of page.prefixes) {
        if (!seen.has(p)) {
          seen.add(p);
          out.push(p);
        }
      }
    }
    return out;
  }, [query.data?.pages]);

  return {
    items,
    allFolders,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
    },
    error: query.error,
    refetch: () => query.refetch(),
    dataUpdatedAt: query.dataUpdatedAt,
  };
}
