'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ActivityIcon,
  CreditCardIcon,
  FilesIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  MenuIcon,
  MessagesSquareIcon,
  PlugIcon,
  SettingsIcon,
  SparklesIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrganizationMembership } from '@/lib/api/server';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OrganizationSwitcher } from '@/components/dashboard/OrganizationSwitcher';
import { UserMenu } from '@/components/dashboard/UserMenu';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const ICONS: Record<string, LucideIcon> = {
  '/dashboard': LayoutDashboardIcon,
  '/dashboard/chat': MessagesSquareIcon,
  '/dashboard/files': FilesIcon,
  '/dashboard/memories': SparklesIcon,
  '/dashboard/team': UsersIcon,
  '/dashboard/providers': PlugIcon,
  '/dashboard/usage': CreditCardIcon,
  '/dashboard/audit': ActivityIcon,
  '/dashboard/settings': SettingsIcon,
};

type DashboardShellProps = {
  children: React.ReactNode;
  isAdmin: boolean;
  user: { name: string; email: string; role: string };
  organizations: OrganizationMembership[];
  activeOrganizationId: string;
};

export function DashboardShell({
  children,
  isAdmin,
  user,
  organizations,
  activeOrganizationId,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const groups: NavGroup[] = [
    {
      label: 'Workspace',
      items: [
        { href: '/dashboard', label: 'Overview', icon: ICONS['/dashboard'] },
        {
          href: '/dashboard/chat',
          label: 'Chat',
          icon: ICONS['/dashboard/chat'],
        },
        {
          href: '/dashboard/files',
          label: 'Files',
          icon: ICONS['/dashboard/files'],
        },
        {
          href: '/dashboard/memories',
          label: 'Memories',
          icon: ICONS['/dashboard/memories'],
        },
      ],
    },
    {
      label: 'Team',
      items: [
        {
          href: '/dashboard/team',
          label: 'Team',
          icon: ICONS['/dashboard/team'],
        },
        {
          href: '/dashboard/providers',
          label: 'Providers',
          icon: ICONS['/dashboard/providers'],
        },
        {
          href: '/dashboard/usage',
          label: isAdmin ? 'Usage & billing' : 'My usage',
          icon: ICONS['/dashboard/usage'],
        },
        {
          href: '/dashboard/settings',
          label: 'Settings',
          icon: ICONS['/dashboard/settings'],
        },
      ],
    },
  ];

  if (isAdmin) {
    groups.push({
      label: 'Admin',
      items: [
        {
          href: '/dashboard/audit',
          label: 'Audit log',
          icon: ICONS['/dashboard/audit'],
        },
      ],
    });
  }

  const activeItem = groups
    .flatMap((group) => group.items)
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
  const pageTitle = activeItem?.label ?? 'Dashboard';

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex min-h-screen bg-background">
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              P
            </span>
            Promplex
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <XIcon className="size-4" />
          </Button>
        </div>

        <div className="px-3 py-3">
          <OrganizationSwitcher
            organizations={organizations}
            activeOrganizationId={activeOrganizationId}
          />
        </div>

        <ScrollArea className="flex-1 px-3">
          <nav className="flex flex-col gap-5 pb-6">
            {groups.map((group) => (
              <div key={group.label} className="flex flex-col gap-1">
                <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        isActive(item.href)
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </ScrollArea>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <MenuIcon className="size-4" />
          </Button>
          <h1 className="text-base font-semibold">{pageTitle}</h1>
          <div className="ml-auto flex items-center gap-1.5">
            <UserMenu name={user.name} email={user.email} role={user.role} />
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
