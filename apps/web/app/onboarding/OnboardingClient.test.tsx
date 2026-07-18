import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from '@/lib/api/server';
import OnboardingPage from './OnboardingClient';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  search: 'invite=invite-token',
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

const preview = {
  organizationId: 'org-invited',
  organizationName: 'Invited Workspace',
  email: 'invited@example.com',
};

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 'user-1',
    email: preview.email,
    name: 'Invitee',
    emailVerifiedAt: '2026-07-17T00:00:00.000Z',
    activeOrganizationId: null,
    role: null,
    memberships: [],
    ...overrides,
  };
}

describe('invite onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = 'invite=invite-token';
    mocks.apiFetch.mockResolvedValue({ ok: true, data: preview });
  });

  it('offers unauthenticated account actions with invite continuity', async () => {
    render(<OnboardingPage currentUser={null} />);

    expect(await screen.findByText('Invited Workspace')).toBeInTheDocument();
    const create = screen.getByRole('link', { name: 'Create account' });
    const signIn = screen.getByRole('link', { name: 'Sign in' });

    for (const link of [create, signIn]) {
      const url = new URL(link.getAttribute('href')!, 'https://example.test');
      expect(url.searchParams.get('email')).toBe(preview.email);
      expect(url.searchParams.get('from')).toBe(
        '/onboarding?invite=invite-token&accept=1',
      );
    }
    expect(
      screen.queryByRole('button', { name: 'Accept and join' }),
    ).not.toBeInTheDocument();
  });

  it('shows an explicit wrong-account state without Accept', async () => {
    render(
      <OnboardingPage currentUser={user({ email: 'admin@example.com' })} />,
    );

    expect(
      await screen.findByText(/invite is for/i),
    ).toHaveTextContent('admin@example.com');
    expect(
      screen.queryByRole('button', { name: 'Accept and join' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign in as another user' }),
    ).toBeInTheDocument();
  });

  it('shows existing members a workspace action', async () => {
    render(
      <OnboardingPage
        currentUser={user({
          memberships: [
            {
              id: 'membership-1',
              organizationId: preview.organizationId,
              role: 'MEMBER',
              suspended: false,
            },
          ],
        })}
      />,
    );

    expect(await screen.findByText('Already a member')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Go to workspace/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Accept and join' }),
    ).not.toBeInTheDocument();
  });

  it('auto-accepts once after returning from authentication', async () => {
    mocks.search = 'invite=invite-token&accept=1';
    mocks.apiFetch
      .mockResolvedValueOnce({ ok: true, data: preview })
      .mockResolvedValueOnce({
        ok: true,
        data: { redirectTo: '/dashboard' },
      });

    render(<OnboardingPage currentUser={user()} />);

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        '/onboarding/join-organization',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(
      mocks.apiFetch.mock.calls.filter(
        ([path]) => path === '/onboarding/join-organization',
      ),
    ).toHaveLength(1);
  });
});
