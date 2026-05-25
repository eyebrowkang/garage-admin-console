/**
 * BucketObjectBrowser — host-side wrapper around the federated
 * s3Browser/FileBrowser remote. Embeds Phase 3 of the MF integration plan:
 *
 *   - lazy-loads the remote so a failed manifest fetch can't crash BucketDetail
 *   - wraps in an ErrorBoundary so RUNTIME-001 / RUNTIME-008 / 404 manifest
 *     errors surface as a graceful inline panel instead of a white screen
 *   - gates on the host cluster having `s3Endpoint` configured (the BFF
 *     needs it to mint per-bucket S3 keypairs; see api/src/lib/garage-keys.ts)
 *   - controls path + view mode locally so the remote stays a pure UI
 *     component per §2.5 of the integration plan
 */
import {
  Component,
  lazy,
  Suspense,
  useState,
  type ComponentType,
  type ReactNode,
  type ErrorInfo,
} from 'react';
import { AlertTriangle, Folder, RefreshCw } from 'lucide-react';
import { mfInstance } from '@/mf-init';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@garage/ui';
import type { FileBrowserProps } from 's3Browser/FileBrowser';

// Go through the mfInstance handle (rather than the global loadRemote) so we
// definitely hit the host-owned MF instance whose share scope was populated
// in src/mf-init.ts with the host's React copies. The Rsbuild-built remote
// then consumes those instead of its own bundled fallback, avoiding React
// 19's "Invalid hook call" two-copies guard.
const FileBrowser = lazy(async () => {
  const mod = await mfInstance.loadRemote<{
    default: ComponentType<FileBrowserProps>;
  }>('s3Browser/FileBrowser');
  if (!mod) throw new Error('s3Browser/FileBrowser returned no module');
  return { default: mod.default };
});

interface BucketObjectBrowserProps {
  clusterId: string;
  /** Internal Garage bucket id (used only for an info hint, not in URLs). */
  bucketId: string;
  /** The human-readable alias the FileBrowser will speak S3 against. */
  bucketAlias: string;
  /** Set in the cluster record; if null the remote can't talk to S3. */
  s3Endpoint: string | null;
}

type ViewMode = 'list' | 'details' | 'grid';

export function BucketObjectBrowser({
  clusterId,
  bucketAlias,
  s3Endpoint,
}: BucketObjectBrowserProps) {
  const [path, setPath] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('details');

  // Cluster missing its S3 endpoint — surface a helpful inline message and
  // let the rest of the BucketDetail page keep working.
  if (!s3Endpoint) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Folder className="h-5 w-5" />
            Browse Objects
          </CardTitle>
          <CardDescription>
            Browse, upload, and presign objects in this bucket via the embedded S3 Browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>S3 endpoint not configured</AlertTitle>
            <AlertDescription>
              This cluster has no <span className="mono">s3Endpoint</span> set, so the embedded file
              browser can't talk to its object surface. Edit the cluster from the Dashboard and add
              the S3 endpoint (e.g. <span className="mono">http://host:3900</span>).
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const token = typeof window !== 'undefined' ? (window.localStorage.getItem('token') ?? '') : '';
  const baseUrl = `/api/clusters/${clusterId}/buckets/${encodeURIComponent(bucketAlias)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Folder className="h-5 w-5" />
          Browse Objects
        </CardTitle>
        <CardDescription>
          Browse, upload, and presign objects in this bucket via the embedded S3 Browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="h-[min(720px,calc(100vh-280px))] min-h-[520px]">
            <RemoteErrorBoundary>
              <Suspense fallback={<FileBrowserSkeleton />}>
                <FileBrowser
                  key={`${clusterId}/${bucketAlias}`}
                  backend={{ baseUrl, authToken: token }}
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
    // Keep this in console for debugging — production builds will route
    // this through whatever error monitor the host wires up later.
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
