import { useState, type FormEvent, type ReactNode } from 'react';
import { Loader2, LockKeyhole } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './alert';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Input } from './input';
import { Label } from './label';

export interface LoginFormProps {
  /** Logo shown in the header badge (each product passes its own asset). */
  logoSrc: string;
  logoAlt: string;
  title: string;
  description: string;
  /**
   * Performs the actual login: request + token persistence + post-auth
   * navigation. Throwing surfaces an error in the form; a 401/403 response is
   * rendered as "Incorrect password".
   */
  onSubmit: (password: string) => Promise<void>;
  /** Footer override; defaults to the shared Source Code · AGPL-3.0 line. */
  footer?: ReactNode;
}

const DEFAULT_FOOTER = (
  <p className="relative mt-6 text-center text-xs text-muted-foreground">
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
  </p>
);

/**
 * Shared login screen for both products. The visual language is identical;
 * each app supplies its branding and an `onSubmit` that owns the request and
 * navigation (React Router navigate, an auth-state flag, etc.).
 */
export function LoginForm({
  logoSrc,
  logoAlt,
  title,
  description,
  onSubmit,
  footer = DEFAULT_FOOTER,
}: LoginFormProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(password);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 401 || status === 403 ? 'Incorrect password' : 'Login failed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !password.trim();

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_55%)]" />

      <Card className="relative w-full max-w-md border-primary/25 shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <img src={logoSrc} alt={logoAlt} className="h-10 w-10" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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

      {footer}
    </div>
  );
}
