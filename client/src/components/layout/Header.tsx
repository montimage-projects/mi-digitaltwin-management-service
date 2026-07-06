import { LogOut, User, Sun, Moon } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useThemeStore } from '@/store/theme-store';
import { APP_NAME, APP_NAME_SHORT, LOGO_SRC, LOGO_ALT, LOGO_BACKDROP } from '@/lib/branding';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex min-w-0 items-center gap-3">
        <img
          src={LOGO_SRC}
          alt={LOGO_ALT}
          className={`h-6 w-auto max-w-[160px] object-contain shrink-0${LOGO_BACKDROP ? ' bg-white rounded px-1.5 py-0.5' : ''}`}
        />
        <h1 className="truncate text-lg font-semibold">
          <span className="hidden sm:inline">{APP_NAME}</span>
          <span className="sm:hidden">{APP_NAME_SHORT}</span>
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <User className="h-4 w-4" />
              <span>{user?.username}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-muted-foreground">
              Role: {user?.role}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
