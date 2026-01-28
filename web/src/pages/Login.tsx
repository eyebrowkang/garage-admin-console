import { useState } from 'react';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight, ShieldCheck } from 'lucide-react';

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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

            <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 backdrop-blur-xl relative z-10 overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

                <CardHeader className="space-y-3 text-center pb-8 pt-10">
                    <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-2">
                        <ShieldCheck className="h-6 w-6" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
                        Garage Admin
                    </CardTitle>
                    <CardDescription className="text-slate-500 text-base">
                        Enter your administrative credentials
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-slate-600 font-medium">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="h-11 bg-slate-50/50 border-slate-200 focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                                autoFocus
                            />
                        </div>

                        {error && (
                            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium flex items-center animate-in fade-in slide-in-from-top-1">
                                {error}
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full h-11 text-base shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all active:scale-[0.98]"
                            disabled={isDisabled}
                        >
                            {isLoading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    Sign In <ArrowRight className="ml-2 h-4 w-4 opacity-50" />
                                </>
                            )}
                        </Button>
                    </form>
                </CardContent>

                <CardFooter className="justify-center border-t bg-slate-50/50 py-4">
                    <div className="text-xs text-muted-foreground text-center">
                        Secure Garage Administration Console v1.0
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
