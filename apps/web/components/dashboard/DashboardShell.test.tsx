import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardShell } from './DashboardShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/usage',
}));
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/dashboard/OrganizationSwitcher', () => ({
  OrganizationSwitcher: () => <div>Organization switcher</div>,
}));
vi.mock('@/components/dashboard/UserMenu', () => ({
  UserMenu: () => <div>User menu</div>,
}));
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const props = {
  user: { name: 'Member', email: 'member@example.com', role: 'MEMBER' },
  organizations: [
    {
      id: 'org-1',
      name: 'Alpha',
      slug: 'alpha',
      planTier: 'FREE' as const,
      role: 'MEMBER' as const,
      suspended: false,
    },
  ],
  activeOrganizationId: 'org-1',
};

describe('DashboardShell role navigation', () => {
  it('shows member navigation without admin-only audit access', () => {
    render(
      <DashboardShell {...props} isAdmin={false}>
        <div>Page</div>
      </DashboardShell>,
    );

    expect(screen.getAllByText('My usage').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('link', { name: /Audit log/ }),
    ).not.toBeInTheDocument();
  });

  it('shows audit navigation and billing label to admins', () => {
    render(
      <DashboardShell {...props} isAdmin>
        <div>Page</div>
      </DashboardShell>,
    );

    expect(screen.getByRole('link', { name: /Audit log/ })).toBeInTheDocument();
    expect(screen.getAllByText('Usage & billing').length).toBeGreaterThan(0);
  });
});
