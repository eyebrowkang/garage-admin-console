/**
 * BucketObjectBrowser — host-side wrapper around the federated
 * s3Browser/FileBrowser remote.
 *
 * Responsibilities:
 *   - Fetches authorized keys for the bucket (GET .../keys).
 *   - Runs the default-key fallback chain to pick an initial key.
 *   - Shows a compact key selector in the card header.
 *   - Shows a zero-key guidance block when no keys are configured.
 *   - Forwards the selected key via X-Garage-Access-Key-Id to every
 *     FileBrowser request (inside backend.headers).
 *   - Persists the selection per (clusterId, bucket) in localStorage.
 */
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
  type ErrorInfo,
} from 'react';
import { AlertTriangle, Folder, Key, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { mfInstance } from '@/mf-init';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@garage/ui';
import { api, readStoredToken } from '@/lib/api';
import type { FileBrowserProps } from 's3Browser/FileBrowser';
import { selectDefaultKey, type AuthorizedKey } from './bucket-key-selection';

function localStorageKey(clusterId: string, bucket: string): string {
  return `filebrowser.lastKey.${clusterId}:${bucket}`;
}

// ---------------------------------------------------------------------------
// Module Federation remote
// ---------------------------------------------------------------------------

const FileBrowser = lazy(async () => {
  const mod = await mfInstance.loadRemote<{
    default: ComponentType<FileBrowserProps>;
  }>('s3Browser/FileBrowser');
  if (!mod) throw new Error('s3Browser/FileBrowser returned no module');
  return { default: mod.default };
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BucketObjectBrowserProps {
  clusterId: string;
  /** Internal Garage bucket id. Used to build the zero-key CTA URL. */
  bucketId: string;
  /** The human-readable alias the FileBrowser speaks S3 against. */
  bucketAlias: string;
  /**
   * Pre-selected key id (e.g. from ?selectKey= URL param after KeyList
   * redirects back). If valid in the authorized-keys list, it takes
   * priority over the normal fallback chain and is written to localStorage.
   */
  initialKeyId?: string;
}

type ViewMode = 'list' | 'grid';

export function BucketObjectBrowser({
  clusterId,
  bucketId,
  bucketAlias,
  initialKeyId,
}: BucketObjectBrowserProps) {
  const navigate = useNavigate();
  const [path, setPath] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [manualSelection, setManualSelection] = useState<{
    scope: string;
    keyId: string;
  } | null>(null);

  const token = readStoredToken() ?? '';
  const baseUrl = `/api/clusters/${clusterId}/buckets/${encodeURIComponent(bucketAlias)}`;
  const selectionScope = `${clusterId}:${bucketAlias}`;
  const lsKey = useMemo(() => localStorageKey(clusterId, bucketAlias), [bucketAlias, clusterId]);

  // Fetch the authorized keys for this bucket.
  const keysQuery = useQuery<AuthorizedKey[]>({
    queryKey: ['bucket-authorized-keys', clusterId, bucketAlias],
    queryFn: async () => {
      const res = await api.get<{ keys: AuthorizedKey[] }>(
        `/clusters/${clusterId}/buckets/${encodeURIComponent(bucketAlias)}/keys`,
      );
      return res.data.keys;
    },
    staleTime: 30_000,
  });

  const authorizedKeys = useMemo(() => keysQuery.data ?? [], [keysQuery.data]);

  const defaultSelectedKeyId = useMemo(() => {
    const keys = keysQuery.data;
    if (!keys) return null;

    if (initialKeyId && keys.some((k) => k.accessKeyId === initialKeyId)) {
      return initialKeyId;
    }

    const saved = typeof window !== 'undefined' ? localStorage.getItem(lsKey) : null;
    return selectDefaultKey(keys, saved);
  }, [initialKeyId, keysQuery.data, lsKey]);

  const selectedKeyId = useMemo(() => {
    const manualKeyId = manualSelection?.scope === selectionScope ? manualSelection.keyId : null;
    if (manualKeyId && authorizedKeys.some((k) => k.accessKeyId === manualKeyId)) {
      return manualKeyId;
    }
    return defaultSelectedKeyId;
  }, [authorizedKeys, defaultSelectedKeyId, manualSelection, selectionScope]);

  // Keep localStorage aligned with the loaded key list and URL-selected key.
  useEffect(() => {
    const keys = keysQuery.data;
    if (!keys || typeof window === 'undefined') return;

    // Priority 0: initialKeyId from URL (?selectKey=)
    if (initialKeyId && keys.some((k) => k.accessKeyId === initialKeyId)) {
      localStorage.setItem(lsKey, initialKeyId);
      return;
    }

    const saved = localStorage.getItem(lsKey);

    // Clear stale localStorage entry if saved key is no longer in the list.
    if (saved && !keys.some((k) => k.accessKeyId === saved)) {
      localStorage.removeItem(lsKey);
    }
  }, [initialKeyId, keysQuery.data, lsKey]);

  const handleKeyChange = (keyId: string) => {
    setManualSelection({ scope: selectionScope, keyId });
    localStorage.setItem(lsKey, keyId);
  };

  // Stable headers object — only recreates when selectedKeyId changes.
  const backendHeaders = useMemo(
    () =>
      selectedKeyId ? ({ 'X-Garage-Access-Key-Id': selectedKeyId } as Record<string, string>) : {},
    [selectedKeyId],
  );

  const isLoading = keysQuery.isLoading;
  const hasNoKeys = !isLoading && keysQuery.data !== undefined && authorizedKeys.length === 0;
  const canRenderBrowser = !hasNoKeys && selectedKeyId !== null;

  const zeroKeyCta = `/clusters/${clusterId}/keys?create=1&prefillName=${encodeURIComponent(`garage-admin-console:${bucketAlias}`)}&grantBucketId=${encodeURIComponent(bucketId)}&returnTo=${encodeURIComponent(`/clusters/${clusterId}/buckets/${bucketId}`)}`;

  const selectedKey = authorizedKeys.find((k) => k.accessKeyId === selectedKeyId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Folder className="h-5 w-5" />
              Browse Objects
            </CardTitle>
            <CardDescription>
              Browse, upload, and manage objects via the embedded S3 Browser.
            </CardDescription>
          </div>

          {/* Key selector — only shown when there are keys to choose from */}
          {!hasNoKeys && authorizedKeys.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground hidden sm:inline">Key</span>
              <Select
                value={selectedKeyId ?? ''}
                onValueChange={handleKeyChange}
                disabled={isLoading}
              >
                <SelectTrigger className="h-8 min-w-[180px] max-w-[280px] text-xs">
                  <SelectValue placeholder={isLoading ? 'Loading…' : 'Select key…'} />
                </SelectTrigger>
                <SelectContent>
                  {authorizedKeys.map((k) => (
                    <SelectItem key={k.accessKeyId} value={k.accessKeyId}>
                      <span className="font-medium">{k.name || 'unnamed'}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {k.accessKeyId.slice(0, 8)}
                      </span>
                      <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                        {k.permissions.owner ? 'owner' : k.permissions.write ? 'rw' : 'r'}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Show active key identity below the header when a key is selected */}
        {selectedKey && (
          <p className="text-xs text-muted-foreground mt-1">
            Using key <span className="font-mono">{selectedKey.accessKeyId.slice(0, 12)}…</span>
            {selectedKey.name && <> ({selectedKey.name})</>}
          </p>
        )}
      </CardHeader>

      <CardContent>
        {/* Zero-key guidance */}
        {hasNoKeys && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Key className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold">No access keys configured</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                This bucket has no authorized keys. Create one to browse objects.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate(zeroKeyCta)}>
              <Key className="mr-2 h-4 w-4" />
              Create access key
            </Button>
          </div>
        )}

        {/* FileBrowser — only rendered once we have a key selected */}
        {canRenderBrowser && (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="h-[min(720px,calc(100vh-280px))] min-h-[520px]">
              <RemoteErrorBoundary>
                <Suspense fallback={<FileBrowserSkeleton />}>
                  <FileBrowser
                    key={`${clusterId}/${bucketAlias}/${selectedKeyId}`}
                    backend={{ baseUrl, authToken: token, headers: backendHeaders }}
                    bucket={bucketAlias}
                    path={path}
                    onPathChange={setPath}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    density="comfortable"
                    showPreview={false}
                  />
                </Suspense>
              </RemoteErrorBoundary>
            </div>
          </div>
        )}

        {/* Loading skeleton while keys are fetching */}
        {isLoading && (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Loading browser…
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FileBrowserSkeleton() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading file browser…
      </div>
    </div>
  );
}

interface BoundaryState {
  error: Error | null;
}

class RemoteErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[BucketObjectBrowser] remote crashed', error, info);
  }

  retry = () => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="max-w-md space-y-1">
          <h3 className="text-base font-semibold">S3 Browser unavailable</h3>
          <p className="text-sm text-muted-foreground">
            Couldn&rsquo;t load the embedded file browser. The rest of this page still works — you
            can manage bucket settings normally.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={this.retry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
        <details className="mt-2 w-full max-w-md text-left">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Technical details
          </summary>
          <pre className="mt-2 max-h-32 overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
            {this.state.error.message}
          </pre>
        </details>
      </div>
    );
  }
}
