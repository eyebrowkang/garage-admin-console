/**
 * Standalone composition root.
 *
 * Layout deliberately mirrors garage-admin-console/web/src/layouts/MainLayout
 * + the Dashboard → ClusterDetail flow:
 *
 *   - header   : sticky border-b bar with logo + Sign Out only
 *   - main     : max-w-7xl, switches between HomePage / ConnectionView /
 *                BucketView based on internal state (no router)
 *   - footer   : repo link + license
 *
 * No persistent sidebar — picking a connection drills in, breadcrumbs go
 * back out. This matches the "outermost layer → cluster page → bucket page"
 * pattern described in CLAUDE.md.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';

import { Button } from '@garage/ui';
import { api, readStoredToken, writeStoredToken } from '@/lib/api';
import type { Connection } from '@/lib/types';
import { LoginPage } from '@/features/auth/LoginPage';
import { HomePage } from '@/features/home/HomePage';
import { ConnectionView } from '@/features/connection/ConnectionView';
import { BucketView } from '@/features/bucket/BucketView';

type ViewState =
  | { kind: 'home' }
  | { kind: 'connection'; connectionId: string }
  | { kind: 'bucket'; connectionId: string; bucket: string };

export function App() {
  const [authed, setAuthed] = useState(() => readStoredToken() !== null);
  const [view, setView] = useState<ViewState>({ kind: 'home' });

  // Loaded once so ConnectionView / BucketView can resolve a connectionId
  // back to its full Connection record (name, endpoint, region) without
  // re-fetching. HomePage already drives the canonical list.
  const connections = useQuery({
    queryKey: ['connections'],
    enabled: authed,
    queryFn: async () => {
      const res = await api.get<Connection[]>('/connections');
      return res.data;
    },
  });

  const activeConnection: Connection | null =
    view.kind === 'home'
      ? null
      : connections.data?.find((c) => c.id === view.connectionId) ?? null;

  if (!authed) {
    return <LoginPage onAuthed={() => setAuthed(true)} />;
  }

  const handleSignOut = () => {
    writeStoredToken(null);
    setAuthed(false);
    setView({ kind: 'home' });
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-background/50">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-14 flex items-center justify-between">
          <button
            onClick={() => setView({ kind: 'home' })}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <img src="/s3-browser-logo.svg" alt="S3 Browser" className="h-7 w-7 sm:h-8 sm:w-8" />
            <span className="font-bold text-base sm:text-lg tracking-tight">S3 Browser</span>
          </button>

          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 text-muted-foreground hover:text-foreground transition-colors"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      <main className="w-full max-w-7xl mx-auto px-4 lg:px-8 py-5 sm:py-6 flex-1">
        {view.kind === 'home' && (
          <HomePage
            onOpenConnection={(id) => setView({ kind: 'connection', connectionId: id })}
          />
        )}
        {view.kind === 'connection' && activeConnection && (
          <ConnectionView
            connection={activeConnection}
            onBack={() => setView({ kind: 'home' })}
            onOpenBucket={(bucket) =>
              setView({ kind: 'bucket', connectionId: activeConnection.id, bucket })
            }
          />
        )}
        {view.kind === 'bucket' && activeConnection && (
          <BucketView
            connection={activeConnection}
            bucket={view.bucket}
            onBack={() =>
              setView({ kind: 'connection', connectionId: activeConnection.id })
            }
          />
        )}
        {view.kind !== 'home' && !activeConnection && connections.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {view.kind !== 'home' && !activeConnection && !connections.isLoading && (
          <p className="text-sm text-muted-foreground">
            Connection no longer exists.{' '}
            <button
              onClick={() => setView({ kind: 'home' })}
              className="text-primary underline-offset-2 hover:underline"
            >
              Go back
            </button>
          </p>
        )}
      </main>

      <footer className="border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-center text-xs text-muted-foreground">
          <a
            href="https://github.com/eyebrowkang/garage-admin-console"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Source Code
          </a>
          <span className="mx-1.5">·</span>
          AGPL-3.0 Licensed
        </div>
      </footer>
    </div>
  );
}

export default App;
