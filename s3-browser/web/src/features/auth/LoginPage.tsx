/**
 * Standalone-only login screen. Talks to POST /api/auth/login, stores the
 * JWT in localStorage, and notifies the parent on success.
 *
 * Visual language mirrors garage-admin-console/web/src/pages/Login.tsx so the
 * two products feel like one suite.
 */
import { useState, type FormEvent } from 'react';
import { Loader2, LockKeyhole } from 'lucide-react';
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
  Input,
  Label,
} from '@garage/ui';
import { api, writeStoredToken } from '@/lib/api';

export function LoginPage({ onAuthed }: { onAuthed: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ token: string }>('/auth/login', { password });
      writeStoredToken(res.data.token);
      onAuthed();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 401 ? 'Incorrect password' : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !password.trim();

  return (
    <div className="relative flex flex-col min-h-screen items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,148,41,0.16),transparent_55%)]" />

      <Card className="relative w-full max-w-md border-primary/25 shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <img src="/s3-browser-logo.svg" alt="S3 Browser" className="h-10 w-10" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl">S3 Browser</CardTitle>
            <CardDescription>Sign in to manage your S3-compatible connections.</CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="h-11"
                autoFocus
                disabled={busy}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <LockKeyhole className="h-4 w-4" />
                <AlertTitle>Authentication failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="h-11 w-full" disabled={disabled}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="relative mt-6 text-center text-xs text-muted-foreground">
        Credentials stored server-side, encrypted at rest.
      </p>
    </div>
  );
}
