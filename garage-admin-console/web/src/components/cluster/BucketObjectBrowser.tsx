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
  useRef,
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
import { api } from '@/lib/api';
import type { FileBrowserProps } from 's3Browser/FileBrowser';

// ---------------------------------------------------------------------------
// Key selection logic — exported for unit testing
// ---------------------------------------------------------------------------

export interface AuthorizedKey {
  accessKeyId: string;
  name: string;
  permissions: { read: boolean; write: boolean; owner: boolean };
}

function capabilityScore(k: AuthorizedKey): number {
  if (k.permissions.owner) return 3;
  if (k.permissions.read && k.permissions.write) return 2;
  if (k.permissions.read) return 1;
  return 0;
}

function bestByCapability(keys: AuthorizedKey[]): string {
  return [...keys].sort((a, b) => {
    const cap = capabilityScore(b) - capabilityScore(a);
    return cap !== 0 ? cap : a.accessKeyId.localeCompare(b.accessKeyId);
  })[0]!.accessKeyId;
}

/**
 * Select a default key from `authorizedKeys` using the 4-step fallback chain:
 *   1. Saved localStorage key (if still in the list).
 *   2. First key whose name starts with `garage-admin-console:`, by
 *      capability score then accessKeyId alphabetically.
 *   3. Highest-capability key (owner > rw > r).
 *   4. Alphabetically first accessKeyId when capability is equal.
 *
 * Returns null when `authorizedKeys` is empty.
 */
export function selectDefaultKey(
  authorizedKeys: AuthorizedKey[],
  savedKeyId: string | null,
): string | null {
  if (authorizedKeys.length === 0) return null;

  // Step 1: saved key still in the list
  if (savedKeyId && authorizedKeys.some((k) => k.accessKeyId === savedKeyId)) {
    return savedKeyId;
  }

  // Step 2: keys with the admin-console prefix
  const prefixKeys = authorizedKeys.filter((k) => k.name.startsWith('garage-admin-console:'));
  if (prefixKeys.length > 0) {
    return bestByCapability(prefixKeys);
  }

  // Steps 3+4: capability priority + alphabetical tiebreak
  return bestByCapability(authorizedKeys);
}

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
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const initialized = useRef(false);

  const token = typeof window !== 'undefined' ? (window.localStorage.getItem('token') ?? '') : '';
  const baseUrl = `/api/clusters/${clusterId}/buckets/${encodeURIComponent(bucketAlias)}`;

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

  // Run the fallback chain once after keys are loaded.
  useEffect(() => {
    const keys = keysQuery.data;
    if (!keys || initialized.current) return;
    initialized.current = true;

    const lsKey = localStorageKey(clusterId, bucketAlias);

    // Priority 0: initialKeyId from URL (?selectKey=)
    if (initialKeyId && keys.some((k) => k.accessKeyId === initialKeyId)) {
      setSelectedKeyId(initialKeyId);
      localStorage.setItem(lsKey, initialKeyId);
      return;
    }

    const saved = localStorage.getItem(lsKey);
    const selected = selectDefaultKey(keys, saved);

    // Clear stale localStorage entry if saved key is no longer in the list.
    if (saved && !keys.some((k) => k.accessKeyId === saved)) {
      localStorage.removeItem(lsKey);
    }

    setSelectedKeyId(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysQuery.data]);

  const handleKeyChange = (keyId: string) => {
    setSelectedKeyId(keyId);
    localStorage.setItem(localStorageKey(clusterId, bucketAlias), keyId);
  };

  // Stable headers object — only recreates when selectedKeyId changes.
  const backendHeaders = useMemo(
    () =>
      selectedKeyId ? ({ 'X-Garage-Access-Key-Id': selectedKeyId } as Record<string, string>) : {},
    [selectedKeyId],
  );

  const authorizedKeys = keysQuery.data ?? [];
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
            Using key{' '}
            <span className="font-mono">{selectedKey.accessKeyId.slice(0, 12)}…</span>
            {selectedKey.name && (
              <> ({selectedKey.name})</>
            )}
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
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
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
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold">S3 Browser unavailable</h3>
          <p className="text-sm text-muted-foreground">
            Couldn&rsquo;t load the embedded file browser. The rest of this page still works.
          </p>
          <p className="text-xs text-muted-foreground">{this.state.error.message}</p>
        </div>
        <Button variant="outline" size="sm" onClick={this.retry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }
}
