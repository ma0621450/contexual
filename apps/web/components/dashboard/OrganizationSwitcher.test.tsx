import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationSwitcher } from './OrganizationSwitcher';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onSelect} disabled={disabled}>
      {children}
    </button>
  ),
}));

const organizations = [
  {
    id: 'org-1',
    name: 'Alpha',
    slug: 'alpha',
    planTier: 'FREE' as const,
    role: 'ADMIN' as const,
    suspended: false,
  },
  {
    id: 'org-2',
    name: 'Beta',
    slug: 'beta',
    planTier: 'FREE' as const,
    role: 'MEMBER' as const,
    suspended: false,
  },
];

describe('OrganizationSwitcher', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows API failure feedback and re-enables switching', async () => {
    mocks.apiFetch.mockResolvedValue({ ok: false, error: 'Switch denied' });
    render(
      <OrganizationSwitcher
        organizations={organizations}
        activeOrganizationId="org-1"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Beta/ }));

    expect(mocks.toastError).toHaveBeenCalledWith('Switch denied');
    expect(screen.getAllByRole('button', { name: /Alpha/ })[0]).toBeEnabled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('navigates to the server-provided destination on success', async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      data: { redirectTo: '/dashboard/chat' },
    });
    render(
      <OrganizationSwitcher
        organizations={organizations}
        activeOrganizationId="org-1"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Beta/ }));

    expect(mocks.push).toHaveBeenCalledWith('/dashboard/chat');
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
