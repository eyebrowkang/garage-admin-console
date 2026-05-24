/**
 * Standalone composition root.
 *
 * State machine: login → connections list → bucket list → file browser.
 * Lightweight URL-less navigation; per §2.6 we don't use react-router.
 */
import { useState } from 'react';
import { Button } from '@garage/ui';
import { LogOut } from 'lucide-react';

import { readStoredToken, writeStoredToken } from '@/lib/api';
import { LoginPage } from '@/features/auth/LoginPage';
import { ConnectionsPage } from '@/features/connections/ConnectionsPage';
import { BucketsPage } from '@/features/buckets/BucketsPage';

type View = { kind: 'connections' } | { kind: 'buckets'; connectionId: string };

export function App() {
  const [authed, setAuthed] = useState(() => readStoredToken() !== null);
  const [view, setView] = useState<View>({ kind: 'connections' });

  if (!authed) {
    return <LoginPage onAuthed={() => setAuthed(true)} />;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b bg-card px-4 py-2">
        <button
          onClick={() => setView({ kind: 'connections' })}
          className="text-sm font-semibold hover:text-primary"
        >
          S3 Browser
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            writeStoredToken(null);
            setAuthed(false);
            setView({ kind: 'connections' });
          }}
        >
          <LogOut /> Sign out
        </Button>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        {view.kind === 'connections' && (
          <ConnectionsPage
            onOpenConnection={(connectionId) => setView({ kind: 'buckets', connectionId })}
          />
        )}
        {view.kind === 'buckets' && (
          <BucketsPage
            connectionId={view.connectionId}
            onBack={() => setView({ kind: 'connections' })}
          />
        )}
      </main>
    </div>
  );
}

export default App;
