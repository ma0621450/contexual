import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  hasAccount: false,
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

function callsTo(path: string) {
  return mocks.apiFetch.mock.calls.filter(([called]) => called === path);
}

describe('invite onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = 'invite=invite-token';
    mocks.apiFetch.mockResolvedValue({ ok: true, data: preview });
  });

  it.each([
    ['URL fragment', 'invite=invite-token', '#proof=email-proof'],
    ['legacy query string', 'invite=invite-token&proof=email-proof', ''],
  ])('lets new invitees join with only a name and password (proof in %s)', async (_, search, hash) => {
    mocks.search = search;
    window.history.replaceState(null, '', `/onboarding?${search}${hash}`);
    mocks.apiFetch.mockImplementation(async (path: string) =>
      path === '/onboarding/invite-signup'
        ? {
            ok: true,
            data: {
              joined: false,
              redirectTo: '/verify-email?from=%2Fonboarding',
            },
          }
        : { ok: true, data: preview },
    );
    render(<OnboardingPage currentUser={null} />);

    expect(
      await screen.findByRole('button', { name: 'Join Invited Workspace' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(preview.email).length).toBeGreaterThan(0);
    expect(window.location.href).not.toContain('email-proof');
    expect(window.location.search).toBe('?invite=invite-token');

    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Meher Ali' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join Invited Workspace' }));

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/verify-email?from=%2Fonboarding'),
    );
    const [, options] = callsTo('/onboarding/invite-signup')[0] as [
      string,
      { body: string },
    ];
    expect(JSON.parse(options.body)).toEqual({
      token: 'invite-token',
      proof: 'email-proof',
      name: 'Meher Ali',
      password: 'password123',
    });
  });

  it('validates the invite signup form before calling the API', async () => {
    render(<OnboardingPage currentUser={null} />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Join Invited Workspace' }),
    );

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(callsTo('/onboarding/invite-signup')).toHaveLength(0);
  });

  it('sends invitees with an existing account to sign in with continuity', async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      data: { ...preview, hasAccount: true },
    });
    render(<OnboardingPage currentUser={null} />);

    const signIn = await screen.findByRole('link', { name: 'Sign in' });
    const url = new URL(signIn.getAttribute('href')!, 'https://example.test');
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('email')).toBe(preview.email);
    expect(url.searchParams.get('from')).toBe(
      '/onboarding?invite=invite-token&accept=1',
    );
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('shows an error state for invalid invitations', async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: false,
      status: 404,
      error: 'Invite not found',
    });
    render(<OnboardingPage currentUser={null} />);

    expect(
      await screen.findByText(/invalid, expired, or has been revoked/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Sign In' })).toBeInTheDocument();
  });

  it('shows an explicit wrong-account state without a join action', async () => {
    render(
      <OnboardingPage currentUser={user({ email: 'admin@example.com' })} />,
    );

    expect(await screen.findByText(/invite is for/i)).toHaveTextContent(
      'admin@example.com',
    );
    expect(
      screen.queryByRole('button', { name: 'Join Invited Workspace' }),
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

    expect(await screen.findByText(/Already a member/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Go to workspace/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Join Invited Workspace' }),
    ).not.toBeInTheDocument();
  });

  it('asks unverified invitees to verify before joining', async () => {
    render(<OnboardingPage currentUser={user({ emailVerifiedAt: null })} />);

    const verify = await screen.findByRole('link', { name: 'Verify email' });
    expect(verify).toHaveAttribute(
      'href',
      `/verify-email?from=${encodeURIComponent('/onboarding?invite=invite-token&accept=1')}`,
    );
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
    expect(callsTo('/onboarding/join-organization')).toHaveLength(1);
  });
});

describe('workspace onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = '';
  });

  it('requires the workspace fields and checks URL availability', async () => {
    mocks.apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/onboarding/slug-suggestion')) {
        return { ok: true, data: { slug: 'meher-studio' } };
      }
      if (path.startsWith('/onboarding/slug-availability')) {
        return {
          ok: true,
          data: {
            slug: 'meher-studio',
            available: false,
            message: 'This workspace URL is already taken',
          },
        };
      }
      return { ok: true, data: {} };
    });
    render(<OnboardingPage currentUser={user()} />);

    fireEvent.click(screen.getByRole('button', { name: /Create a workspace/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(
      await screen.findByText('Organization name must be at least 2 characters'),
    ).toBeInTheDocument();
    expect(screen.getByText('Choose your organization type')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Organization Name'), {
      target: { value: 'Meher Studio' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate workspace URL' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Workspace URL')).toHaveValue('meher-studio'),
    );
    expect(
      await screen.findByText('This workspace URL is already taken'),
    ).toBeInTheDocument();
    expect(callsTo('/onboarding/create-organization')).toHaveLength(0);
  });
});
