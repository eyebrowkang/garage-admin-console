/**
 * Standalone-only login screen. Talks to POST /api/auth/login, stores the JWT,
 * and notifies the parent on success.
 *
 * Renders the shared <LoginForm> (from @garage/ui) so the two products feel
 * like one suite.
 */
import { LoginForm } from '@garage/ui';
import { api, writeStoredToken } from '@/lib/api';

export function LoginPage({ onAuthed }: { onAuthed: () => void }) {
  return (
    <LoginForm
      logoSrc="/s3-browser-logo.svg"
      logoAlt="S3 Browser"
      title="S3 Browser"
      description="Sign in to manage your S3-compatible connections."
      onSubmit={async (password) => {
        const res = await api.post<{ token: string }>('/auth/login', { password });
        writeStoredToken(res.data.token);
        onAuthed();
      }}
    />
  );
}
