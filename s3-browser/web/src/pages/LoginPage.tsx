/**
 * Standalone-only login screen at the `/login` route. Talks to
 * POST /api/auth/login, stores the JWT, then navigates home — the
 * ProtectedShell re-reads the token and lets the app through.
 *
 * Renders the shared <LoginForm> (from @garage/ui) so the two products feel
 * like one suite.
 */
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '@garage/ui';
import { api, writeStoredToken, writeStoredRefreshToken } from '@/lib/api';

export function LoginPage() {
  const navigate = useNavigate();
  return (
    <LoginForm
      logoSrc="/s3-browser-logo.svg"
      logoAlt="S3 Browser"
      title="S3 Browser"
      description="Sign in to manage your S3-compatible connections."
      onSubmit={async (password) => {
        const res = await api.post<{ token: string; refreshToken: string }>('/auth/login', {
          password,
        });
        writeStoredToken(res.data.token);
        writeStoredRefreshToken(res.data.refreshToken);
        navigate('/', { replace: true });
      }}
    />
  );
}
