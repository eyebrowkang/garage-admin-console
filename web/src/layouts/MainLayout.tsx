import { Outlet, Link, useLocation } from 'react-router-dom'; // Keep if used, but error said it's unused. Wait, cn is used in NavItem but passing variant string? No, cn is imported but used?
// Error: 'cn' is declared but its value is never read.
// checking code: NavItem uses Button. Button uses cn internally. MainLayout doesn't use cn directly?
// line 2: import { cn } ...
// NavItem logic:
// className="w-full justify-start"
// But cn is NOT used in MainLayout file. Button imported from ui/button handles it.
// So remove cn.
// Also remove Settings.

import { Button } from '@/components/ui/button';
import { LayoutDashboard, Server, LogOut } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export function MainLayout() {
    const location = useLocation();
    const handleLogout = () => {
        localStorage.removeItem('token');
        window.location.href = '/login';
    };

    const NavItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
        return (
            <Button
                variant={location.pathname === to ? "secondary" : "ghost"}
                className="w-full justify-start"
                asChild
            >
                <Link to={to}>
                    <Icon className="mr-2 h-4 w-4" />
                    {label}
                </Link>
            </Button>
        )
    }

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            {/* Sidebar */}
            <div className="w-64 border-r flex flex-col bg-card">
                <div className="p-6">
                    <h1 className="text-xl font-bold tracking-tight">Garage Admin</h1>
                </div>
                <Separator />
                <nav className="flex-1 p-4 space-y-2">
                    <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
                    <NavItem to="/clusters" icon={Server} label="Clusters" />
                    {/* Add more links later */}
                </nav>
                <div className="p-4">
                    <Button variant="ghost" className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Logout
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-8">
                <Outlet />
            </main>
        </div>
    );
}
