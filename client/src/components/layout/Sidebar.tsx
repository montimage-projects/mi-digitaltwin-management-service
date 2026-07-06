import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  FolderKanban,
  Network,
  BarChart3,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_NAME_SHORT, LOGO_SRC, LOGO_ALT, LOGO_BACKDROP } from '@/lib/branding';
import { Button } from '@/components/ui/button';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Services', href: '/services', icon: Server },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'Infrastructure', href: '/infrastructure', icon: Network },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();

  return (
    <div
      className={cn(
        'flex h-full flex-col border-r bg-background transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed && (
          <img
            src={LOGO_SRC}
            alt={LOGO_ALT}
            className={`h-10 w-auto max-w-[160px] object-contain${LOGO_BACKDROP ? ' bg-white rounded px-1.5 py-0.5' : ''}`}
          />
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn('h-8 w-8', collapsed && 'mx-auto')}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className={cn('flex-1 space-y-1 py-4', collapsed ? 'px-2' : 'px-3')}>
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              title={collapsed ? item.name : undefined}
              className={cn(
                'flex items-center rounded-md text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
                isActive
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={cn('border-t py-4', collapsed ? 'px-2' : 'px-6')}>
        {!collapsed && (
          <>
            <p className="text-xs text-muted-foreground">{APP_NAME_SHORT}</p>
            <p className="text-xs text-muted-foreground">v1.0.0</p>
          </>
        )}
      </div>
    </div>
  );
}
