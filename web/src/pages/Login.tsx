import { useState } from 'react';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Lock, AlertCircle } from 'lucide-react';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/login', { password });
      localStorage.setItem('token', res.data.token);
      navigate('/');
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, 'Login failed. Please try again.');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const isDisabled = isLoading || !password.trim();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(251,146,60,0.08),transparent_50%),radial-gradient(circle_at_70%_80%,rgba(245,158,11,0.08),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(251,146,60,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(251,146,60,0.03)_1px,transparent_1px)] bg-[size:40px_40px]"></div>

      {/* Floating garage icon pattern */}
      <div className="absolute top-20 left-10 w-24 h-24 opacity-5">
        <img src="/garage-notext.svg" alt="Garage logo" className="w-full h-full" />
      </div>
      <div className="absolute bottom-20 right-10 w-32 h-32 opacity-5">
        <img src="/garage-notext.svg" alt="Garage logo" className="w-full h-full" />
      </div>

      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/90 backdrop-blur-xl relative z-10 overflow-hidden">
        {/* Accent bar */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-amber-400 to-yellow-400"></div>

        <CardHeader className="space-y-4 text-center pb-6 pt-12">
          {/* Logo/Icon */}
          <div className="mx-auto relative">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full"></div>
            <div className="relative h-20 w-20 mx-auto flex items-center justify-center">
              <img
                src="/garage-notext.svg"
                alt="Garage"
                className="h-14 w-14 scale-[1.35] drop-shadow-[0_8px_18px_rgba(251,146,60,0.35)]"
              />
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
              Garage Admin
            </CardTitle>
            <CardDescription className="text-base text-gray-600">
              Secure cluster management console
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="px-8 pb-8">
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Password input */}
            <div className="space-y-2.5">
              <Label
                htmlFor="password"
                className="text-sm font-semibold text-gray-700 flex items-center gap-2"
              >
                <Lock className="h-4 w-4 text-primary" />
                Admin Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="h-12 pl-4 pr-4 bg-white border-2 border-gray-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-lg text-base"
                  autoFocus
                />
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div
                role="alert"
                className="p-4 rounded-lg bg-red-50 border-2 border-red-200 text-red-700 text-sm font-medium flex items-start gap-3 animate-in fade-in slide-in-from-top-2"
              >
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit button */}
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-200 active:scale-[0.98] rounded-lg"
              disabled={isDisabled}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-5 w-5" />
                  Sign In
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
