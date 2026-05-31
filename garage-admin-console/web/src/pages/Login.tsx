import { useNavigate } from 'react-router-dom';
import { LoginForm } from '@garage/ui';
import { api, writeStoredToken } from '@/lib/api';

export default function Login() {
  const navigate = useNavigate();

  return (
    <LoginForm
      logoSrc="/garage-admin-logo.svg"
      logoAlt="Garage Admin"
      title="Garage Admin Console"
      description="Sign in to manage your Garage clusters."
      onSubmit={async (password) => {
        const response = await api.post<{ token: string }>('/auth/login', { password });
        writeStoredToken(response.data.token);
        navigate('/');
      }}
    />
  );
}
