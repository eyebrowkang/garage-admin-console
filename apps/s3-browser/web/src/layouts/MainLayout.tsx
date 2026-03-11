import { Outlet, useNavigate, Link } from 'react-router-dom';
import { LogOut, HardDrive } from 'lucide-react';
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
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 sm:h-8 sm:w-8">
              <HardDrive className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
            </div>
            <span className="text-base font-bold tracking-tight sm:text-lg">S3 Browser</span>
          </Link>

          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 text-muted-foreground transition-colors hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:py-6 lg:px-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-4 text-xs text-muted-foreground lg:px-8">
          <a
            href="https://github.com/eyebrowkang/garage-admin-console"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors hover:text-foreground"
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
