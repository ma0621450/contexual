'use client';

/* Figma SVGs are rendered at the width and height authored in the file. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { OrganizationMembership } from '@/lib/api/server';
import { CommandPalette } from '@/components/dashboard/CommandPalette';
import { OrganizationSwitcher } from '@/components/dashboard/OrganizationSwitcher';
import { UserMenu } from '@/components/dashboard/UserMenu';
import {
  dashboardCrumbs,
  isNavActive,
  visibleNav,
  type DashboardNavItem,
} from '@/components/dashboard/dashboard-nav';

const COLLAPSED_KEY = 'promplex.sidebar.collapsed';
const SIDEBAR_EVENT = 'promplex-sidebar';

function collapsedSnapshot() {
  return window.localStorage.getItem(COLLAPSED_KEY) === '1';
}

function subscribeCollapsed(onStoreChange: () => void) {
  window.addEventListener(SIDEBAR_EVENT, onStoreChange);
  return () => window.removeEventListener(SIDEBAR_EVENT, onStoreChange);
}

function modifierKey() {
  if (typeof navigator === 'undefined') return 'Ctrl' as const;
  const platform = `${navigator.platform} ${navigator.userAgent}`;
  return /Mac|iPhone|iPad/.test(platform) ? ('⌘' as const) : ('Ctrl' as const);
}

const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-white/50';

type DashboardShellProps = {
  children: ReactNode;
  isAdmin: boolean;
  user: { name: string; email: string; role: string };
  organizations: OrganizationMembership[];
  activeOrganizationId: string;
  banner?: ReactNode;
};

export function DashboardShell({
  children,
  isAdmin,
  user,
  organizations,
  activeOrganizationId,
  banner,
}: DashboardShellProps) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    collapsedSnapshot,
    () => false,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const shortcut = useSyncExternalStore(
    () => () => {},
    modifierKey,
    () => 'Ctrl' as const,
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function toggleCollapsed() {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '0' : '1');
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  }

  const items = visibleNav(isAdmin);
  const groups = ['Workspace', 'Main', 'Admin']
    .map((label) => ({
      label,
      items: items.filter((item) => item.group === label),
    }))
    .filter((group) => group.items.length > 0);
  const crumbs = dashboardCrumbs(pathname, isAdmin);

  return (
    <div className="flex h-dvh flex-col bg-shell-bg text-shell-text">
      {banner}
      <div className="flex min-h-0 flex-1 gap-3 p-[17px]">
        {mobileOpen ? (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <aside
          className={cn(
            'z-50 flex shrink-0 flex-col rounded-[15px] bg-shell-panel py-[23px] transition-[width,transform] duration-200',
            collapsed ? 'w-[60px] px-2' : 'w-[278px] px-[18px]',
            mobileOpen
              ? 'fixed inset-y-[17px] left-[17px] flex w-[278px] translate-x-0 bg-raised px-[18px] shadow-elevated'
              : 'fixed inset-y-[17px] left-[17px] hidden -translate-x-[120%] lg:flex lg:static lg:translate-x-0',
          )}
        >
          <div
            className={cn(
              'flex items-center',
              collapsed && !mobileOpen ? 'justify-center' : 'justify-between',
            )}
          >
            <Link
              href="/dashboard"
              aria-label="Overview"
              className={cn('inline-flex', focusRing, 'rounded-md')}
              onClick={() => setMobileOpen(false)}
            >
              <img
                src="/brand/logo-mark.svg"
                alt=""
                width={40.392}
                height={48}
              />
            </Link>
          </div>

          <nav
            aria-label="Workspace"
            className={cn(
              'mt-[47px] flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto',
              collapsed && !mobileOpen && 'mt-[49px] items-center gap-1.5',
            )}
          >
            {(collapsed && !mobileOpen ? (
              <CollapsedNav
                items={items}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            ) : (
              groups.map((group) => (
                <div key={group.label} className="flex flex-col gap-3">
                  <p className="text-sm font-medium tracking-[-0.14px] text-shell-muted uppercase">
                    {group.label}
                  </p>
                  <div className="flex flex-col">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        active={isNavActive(pathname, item.href)}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ))
            ))}
          </nav>

          <div className={cn('mt-4', collapsed && !mobileOpen && 'flex justify-center')}>
            <OrganizationSwitcher
              organizations={organizations}
              activeOrganizationId={activeOrganizationId}
              compact={collapsed && !mobileOpen}
            />
          </div>

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'mt-3 hidden size-10 items-center justify-center rounded-[10px] text-shell-muted hover:bg-shell-hover hover:text-shell-text lg:inline-flex',
              focusRing,
            )}
          >
            <SidebarGlyph />
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <header className="flex h-[50px] shrink-0 items-center gap-3 rounded-[8px] bg-shell-panel px-3.5">
            <button
              type="button"
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-md text-shell-muted hover:bg-shell-hover lg:hidden',
                focusRing,
              )}
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <MenuGlyph />
            </button>
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex min-w-0 items-center gap-2 text-sm font-medium tracking-[-0.14px] text-shell-muted uppercase">
                {crumbs.map((crumb, index) => {
                  const last = index === crumbs.length - 1;
                  return (
                    <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2">
                      {index > 0 ? (
                        <span aria-hidden="true" className="text-dim">
                          /
                        </span>
                      ) : null}
                      {crumb.href && !last ? (
                        <Link
                          href={crumb.href}
                          className={cn('truncate hover:text-shell-text', focusRing, 'rounded-sm')}
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span className="truncate" aria-current={last ? 'page' : undefined}>
                          {crumb.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-[6px] bg-shell-raised px-2 text-[11px] font-medium text-shell-muted hover:bg-shell-hover',
                focusRing,
                'w-8 justify-center sm:w-[311px] sm:justify-start',
              )}
              aria-label={`Search anything (${shortcut === '⌘' ? 'Command' : 'Control'} K)`}
            >
              <img
                src="/brand/nav/search.svg"
                alt=""
                width="15.55"
                height="15.55"
              />
              <span className="hidden flex-1 text-left sm:inline">
                Search anything...
              </span>
              <span className="hidden items-center gap-0.5 sm:inline-flex">
                {shortcut === '⌘' ? (
                  <img
                    src="/brand/nav/command.svg"
                    alt=""
                    width="9.33"
                    height="9.33"
                  />
                ) : (
                  <span>Ctrl</span>
                )}
                <span>K</span>
              </span>
            </button>
            <UserMenu name={user.name} email={user.email} role={user.role} />
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        isAdmin={isAdmin}
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
        shortcutLabel={shortcut === '⌘' ? 'Command K' : 'Control K'}
      />
    </div>
  );
}

function NavLink({
  item,
  active,
  collapsed = false,
  onNavigate,
}: {
  item: DashboardNavItem;
  active: boolean;
  collapsed?: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'relative flex items-center rounded-[10px] text-base font-medium tracking-[-0.16px] transition-colors',
        focusRing,
        collapsed ? 'size-10 justify-center' : 'gap-2.5 px-3 py-2.5',
        active
          ? 'bg-shell-active text-shell-text'
          : 'text-shell-muted hover:bg-shell-hover hover:text-shell-text',
      )}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r bg-white"
        />
      ) : null}
      <img src={item.icon} alt="" width={20} height={20} />
      <span className={collapsed ? 'sr-only' : undefined}>{item.label}</span>
    </Link>
  );
}

function CollapsedNav({
  items,
  pathname,
  onNavigate,
}: {
  items: DashboardNavItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  const sections = ['Workspace', 'Main', 'Admin']
    .map((group) => items.filter((item) => item.group === group))
    .filter((section) => section.length > 0);

  return (
    <>
      {sections.map((section, index) => (
        <div key={section[0]?.group} className="flex flex-col items-center gap-1.5">
          {index > 0 ? (
            <span aria-hidden="true" className="my-1 h-px w-6 bg-shell-line" />
          ) : null}
          {section.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isNavActive(pathname, item.href)}
              collapsed
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function SidebarGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4v12" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function MenuGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
