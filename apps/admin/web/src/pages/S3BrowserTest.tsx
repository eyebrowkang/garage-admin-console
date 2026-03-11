import React, { Suspense, useState } from 'react';
import { PageLoadingState } from '@/components/cluster/PageLoadingState';

const RemoteS3EmbedProvider = React.lazy(() =>
  import('s3_browser/S3EmbedProvider').then((m) => ({ default: m.S3EmbedProvider })),
);

const RemoteBucketExplorer = React.lazy(() =>
  import('s3_browser/BucketExplorer').then((m) => ({ default: m.BucketExplorer })),
);

export function S3BrowserTest() {
  const [apiBase, setApiBase] = useState('http://localhost:3002/api');
  const [connectionId, setConnectionId] = useState('');
  const [bucket, setBucket] = useState('');
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);

  if (!connected) {
    return (
      <div className="mx-auto max-w-md space-y-6 pt-8">
        <div>
          <h1 className="text-xl font-bold">S3 Browser — Module Federation Test</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect to an S3 Browser instance to browse objects. The S3 Browser components are loaded
            remotely via Module Federation.
          </p>
        </div>

        <div className="space-y-4 rounded-lg border bg-card p-6">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="mf-api-base">
              S3 Browser API Base
            </label>
            <input
              id="mf-api-base"
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="http://localhost:3002/api"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="mf-token">
              JWT Token
            </label>
            <input
              id="mf-token"
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste token from S3 Browser login"
            />
            <p className="text-xs text-muted-foreground">
              Log in to the S3 Browser app first, then copy the token from localStorage.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="mf-conn-id">
              Connection ID
            </label>
            <input
              id="mf-conn-id"
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              placeholder="Connection UUID"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="mf-bucket">
              Bucket <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="mf-bucket"
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              placeholder="Leave empty to browse all buckets"
            />
          </div>

          <button
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={!connectionId.trim() || !token.trim()}
            onClick={() => setConnected(true)}
          >
            Connect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">S3 Browser (Embedded)</h1>
          <p className="text-sm text-muted-foreground">
            Remote components loaded via Module Federation from {apiBase.replace('/api', '')}
          </p>
        </div>
        <button
          className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
          onClick={() => setConnected(false)}
        >
          Disconnect
        </button>
      </div>

      <Suspense fallback={<PageLoadingState label="Loading S3 Browser components..." />}>
        <RemoteS3EmbedProvider
          config={{
            apiBase,
            connectionId,
            bucket: bucket || undefined,
            token,
          }}
        >
          <RemoteBucketExplorer />
        </RemoteS3EmbedProvider>
      </Suspense>
    </div>
  );
}
