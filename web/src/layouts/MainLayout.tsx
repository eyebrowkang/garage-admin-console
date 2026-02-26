import { Outlet, useNavigate, Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function MainLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-background/50">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <img src="/garage-notext.svg" alt="Garage" className="h-7 w-7 sm:h-8 sm:w-8" />
            <span className="font-bold text-base sm:text-lg tracking-tight">Garage Admin</span>
          </Link>

          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 text-muted-foreground hover:text-foreground transition-colors"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-7xl mx-auto px-4 lg:px-8 py-5 sm:py-6">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-center text-xs text-muted-foreground">
          <a
            href="https://github.com/eyebrowkang/garage-admin-console"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Source Code
          </a>
          <span className="mx-1.5">&middot;</span>
          AGPL-3.0 Licensed
        </div>
      </footer>
    </div>
  );
}
