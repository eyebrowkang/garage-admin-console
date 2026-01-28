import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Server, LogOut, HardDrive, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { ComponentType } from 'react';

type NavItemProps = {
  to: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  exact?: boolean;
  onClick?: () => void;
};

function NavItem({ to, icon: Icon, label, exact = false, onClick }: NavItemProps) {
  const location = useLocation();
  const isActive = exact ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <Link to={to} className="w-full" onClick={onClick}>
      <Button
        variant={isActive ? 'secondary' : 'ghost'}
        className={cn(
          'w-full justify-start gap-3 px-3',
          isActive && 'bg-secondary font-medium text-primary',
        )}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Button>
    </Link>
  );
}

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <>
      <div className="p-6 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-lg shadow-primary/20">
          G
        </div>
        <span className="font-bold text-lg tracking-tight">Garage Console</span>
      </div>

      <div className="flex-1 px-4 space-y-2 py-4">
        <div className="text-xs font-semibold text-muted-foreground px-3 mb-2 uppercase tracking-wider">
          Platform
        </div>
        <NavItem
          to="/"
          icon={LayoutDashboard}
          label="Dashboard"
          exact={true}
          onClick={onNavClick}
        />
        <NavItem to="/clusters" icon={Server} label="Clusters" onClick={onNavClick} />

        <div className="mt-8 text-xs font-semibold text-muted-foreground px-3 mb-2 uppercase tracking-wider">
          Settings
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 text-muted-foreground hover:text-foreground"
        >
          <HardDrive className="h-4 w-4" />
          Global Config
        </Button>
      </div>

      <div className="p-4 mt-auto border-t bg-muted/20">
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="text-sm font-medium">Administrator</div>
          <div className="text-xs text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
            Online
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </>
  );
}

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-background/50 backdrop-blur-sm">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-none border-r bg-card/80 backdrop-blur-xl h-full flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile Header + Sheet */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 border-b bg-card/80 backdrop-blur-xl flex items-center px-4 gap-4">
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 flex flex-col">
            <SidebarContent onNavClick={() => setSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            G
          </div>
          <span className="font-semibold">Garage Console</span>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto lg:ml-0">
        {/* Desktop Header */}
        <header className="hidden lg:flex h-16 border-b bg-card/50 backdrop-blur-md sticky top-0 z-10 px-8 items-center justify-between">
          <div className="text-sm text-muted-foreground">Welcome back</div>
          <div className="flex items-center gap-4">{/* Header Actions if needed */}</div>
        </header>

        {/* Mobile Spacer */}
        <div className="lg:hidden h-14" />

        <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
