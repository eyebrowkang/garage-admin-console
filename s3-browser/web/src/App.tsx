/**
 * Standalone composition root.
 *
 * Layout mirrors garage-admin-console/web/src/layouts/MainLayout:
 *   - header: sticky border-b bar with logo + Sign Out
 *   - main:   max-w-full, react-router routes for Home / Connection / Bucket
 *   - footer: repo link + license
 *
 * React Router owns the URL state so refreshes restore both the current view
 * AND the in-bucket path. The federated <FileBrowser/> stays router-free —
 * App resolves path[] from the URL splat and pushes new URLs on navigation.
 */
import { LogOut } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  Link,
  useNavigate,
} from 'react-router-dom';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@garage/ui';
import { useAuthToken, writeStoredToken } from '@/lib/api';
import { LoginPage } from '@/pages/LoginPage';
import { HomePage } from '@/pages/HomePage';
import { ConnectionView } from '@/pages/ConnectionView';
import { BucketView } from '@/pages/BucketView';
import { Toaster } from '@garage/ui';

// Dev-only FileBrowser mock playground, reachable at /__playground. The lazy
// import lives inside an `if (import.meta.env.DEV)` *statement* so that in a
// production build (DEV → literal false) the dead branch — and with it the
// dynamic import() — is dropped entirely, keeping the playground + mock out of
// the prod bundle (no orphan chunk).
let FileBrowserPlayground: React.LazyExoticComponent<React.ComponentType> | null = null;
if (import.meta.env.DEV) {
  FileBrowserPlayground = lazy(() => import('@/dev/FileBrowserPlayground'));
}

export function App() {
  if (
    import.meta.env.DEV &&
    FileBrowserPlayground &&
    window.location.pathname.startsWith('/__playground')
  ) {
    const Playground = FileBrowserPlayground;
    return (
      <Suspense fallback={null}>
        <Playground />
      </Suspense>
    );
  }
  return <MainApp />;
}

function MainApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/connections/:id" element={<ConnectionView />} />
          <Route path="/connections/:id/b/:bucket/*" element={<BucketView />} />
          <Route path="*" element={<HomePage />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

/** Auth gate + shared chrome (header / footer) for every signed-in route. */
function ProtectedShell() {
  const navigate = useNavigate();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // Reactive: an expired session (a 401 that clears the token via
  // onUnauthorized) re-renders this guard and routes to /login — no manual
  // redirect, and embedded mode is unaffected (it never uses this shell).
  const token = useAuthToken();

  if (token === null) {
    return <Navigate to="/login" replace />;
  }

  const handleSignOut = () => {
    writeStoredToken(null);
    setConfirmSignOut(false);
    navigate('/login', { replace: true });
  };

  return (
    <>
      <div className="flex min-h-screen w-full flex-col bg-background/50">
        <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-xl">
          <div className="max-w-[80%] mx-auto px-4 lg:px-8 h-14 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <img src="/s3-browser-logo.svg" alt="S3 Browser" className="h-7 w-7 sm:h-8 sm:w-8" />
              <span className="font-bold text-base sm:text-lg tracking-tight">S3 Browser</span>
            </Link>

            <Button
              variant="outline"
              size="sm"
              aria-label="Sign out"
              className="h-9 px-3 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setConfirmSignOut(true)}
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </header>

        <Dialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Sign Out</DialogTitle>
              <DialogDescription>
                You will need to sign in again to browse your S3 connections. Continue?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmSignOut(false)}>
                Cancel
              </Button>
              <Button onClick={handleSignOut}>Sign Out</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <main className="w-full max-w-[80%] mx-auto px-4 lg:px-8 py-5 sm:py-6 flex-1">
          <Outlet />
        </main>

        <footer className="border-t mt-auto">
          <div className="max-w-[80%] mx-auto px-4 lg:px-8 py-4 flex items-center justify-center text-xs text-muted-foreground">
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
    </>
  );
}

export default App;
