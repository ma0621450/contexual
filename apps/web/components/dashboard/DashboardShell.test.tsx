import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { dashboardCrumbs } from './dashboard-nav';
import { DashboardShell } from './DashboardShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/usage',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
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
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

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

describe('dashboard crumbs', () => {
  it('uses a single label on a section and a trail inside a chat', () => {
    expect(dashboardCrumbs('/dashboard/chat', false)).toEqual([
      { label: 'Chat' },
    ]);
    expect(dashboardCrumbs('/dashboard/chat/abc', false)).toEqual([
      { href: '/dashboard/chat', label: 'Chat' },
      { label: 'Conversation' },
    ]);
    expect(dashboardCrumbs('/dashboard/chat/shared/token', true)).toEqual([
      { href: '/dashboard/chat', label: 'Chat' },
      { label: 'Shared' },
    ]);
  });
});

describe('DashboardShell role navigation', () => {
  it('shows member navigation without admin-only audit access', () => {
    render(
      <DashboardShell {...props} isAdmin={false}>
        <div>Page</div>
      </DashboardShell>,
    );

    expect(screen.getByRole('link', { name: 'Billing' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      'Billing',
    );
    expect(screen.getByText('Organization switcher')).toBeInTheDocument();
    expect(screen.getByText('User menu')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Audit Logs' }),
    ).not.toBeInTheDocument();
  });

  it('shows audit navigation to admins', () => {
    render(
      <DashboardShell {...props} isAdmin>
        <div>Page</div>
      </DashboardShell>,
    );

    expect(screen.getByRole('link', { name: 'Audit Logs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Billing' })).toBeInTheDocument();
  });

  it('collapses the sidebar and opens the command palette from the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <DashboardShell {...props} isAdmin={false}>
        <div>Page</div>
      </DashboardShell>,
    );

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: 'Chat' })).toBeInTheDocument();

    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Search anything')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search anything'), 'files');
    expect(screen.getByRole('option', { name: 'Files' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Audit Logs' })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search anything'));
    await user.type(screen.getByLabelText('Search anything'), 'not-a-real-page');
    expect(screen.getByText('No matching actions.')).toBeInTheDocument();
  });
});
