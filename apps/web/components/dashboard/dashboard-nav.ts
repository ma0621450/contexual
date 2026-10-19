export type DashboardNavItem = {
  href: string;
  label: string;
  icon: string;
  group: 'Workspace' | 'Main' | 'Admin';
  adminOnly?: boolean;
};

/** Destinations that already exist under /dashboard. Labels follow the shell frames. */
export const DASHBOARD_NAV: DashboardNavItem[] = [
  {
    href: '/dashboard',
    label: 'Overview',
    icon: '/brand/nav/overview.svg',
    group: 'Workspace',
  },
  {
    href: '/dashboard/chat',
    label: 'Chat',
    icon: '/brand/nav/chat.svg',
    group: 'Workspace',
  },
  {
    href: '/dashboard/files',
    label: 'Files',
    icon: '/brand/nav/files.svg',
    group: 'Workspace',
  },
  {
    href: '/dashboard/memories',
    label: 'Memories',
    icon: '/brand/nav/memories.svg',
    group: 'Workspace',
  },
  {
    href: '/dashboard/team',
    label: 'Team',
    icon: '/brand/nav/team.svg',
    group: 'Main',
  },
  {
    href: '/dashboard/providers',
    label: 'Providers',
    icon: '/brand/nav/providers.svg',
    group: 'Main',
  },
  {
    href: '/dashboard/usage',
    label: 'Billing',
    icon: '/brand/nav/billing.svg',
    group: 'Main',
  },
  {
    href: '/dashboard/settings',
    label: 'Preferences',
    icon: '/brand/nav/preferences.svg',
    group: 'Main',
  },
  {
    href: '/dashboard/audit',
    label: 'Audit Logs',
    icon: '/brand/nav/audit.svg',
    group: 'Admin',
    adminOnly: true,
  },
];

export function visibleNav(isAdmin: boolean) {
  return DASHBOARD_NAV.filter((item) => isAdmin || !item.adminOnly);
}

export function isNavActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type Crumb = { href?: string; label: string };

/** One segment on a section root, so the header matches the single Figma label. */
export function dashboardCrumbs(pathname: string, isAdmin: boolean): Crumb[] {
  const match = visibleNav(isAdmin)
    .filter((item) => isNavActive(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!match) return [{ label: 'Dashboard' }];
  if (pathname === match.href || match.href !== '/dashboard/chat') {
    return [{ label: match.label }];
  }

  const rest = pathname.slice(match.href.length);
  const nested = rest.startsWith('/shared') ? 'Shared' : 'Conversation';
  return [{ href: match.href, label: match.label }, { label: nested }];
}
