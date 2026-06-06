import { useNavigate } from 'react-router-dom';
import { LoginForm } from '@garage/ui';
import { api, writeStoredToken, writeStoredRefreshToken } from '@/lib/api';

export default function Login() {
  const navigate = useNavigate();

  return (
    <LoginForm
      logoSrc="/garage-admin-logo.svg"
      logoAlt="Garage Admin"
      title="Garage Admin Console"
      description="Sign in to manage your Garage clusters."
      onSubmit={async (password) => {
        const response = await api.post<{ token: string; refreshToken: string }>('/auth/login', {
          password,
        });
        writeStoredToken(response.data.token);
        writeStoredRefreshToken(response.data.refreshToken);
        navigate('/');
      }}
    />
  );
}
