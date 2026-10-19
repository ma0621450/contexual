import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamMember, TeamOverview } from '@/lib/api/server';
import { TeamClient } from './TeamClient';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));

const overview: TeamOverview = {
  id: 'org-1',
  name: 'Memory Studio',
  slug: 'memory-studio',
  planTier: 'FREE',
  maxMembers: 3,
  memberCount: 1,
  pendingInvites: 0,
  seatsRemaining: 2,
};

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    membershipId: 'mem-1',
    userId: 'user-1',
    name: 'Memory User',
    email: 'member@example.com',
    role: 'ADMIN',
    suspended: false,
    joinedAt: '2026-07-16T12:00:00.000Z',
    ...overrides,
  };
}

describe('TeamClient', () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
    mocks.refresh.mockReset();
    mocks.push.mockReset();
  });

  it('shows the organization summary without sample members', () => {
    render(
      <TeamClient
        currentUserId="user-1"
        isAdmin
        members={[member()]}
        invites={[]}
        overview={overview}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument();
    expect(screen.getByText('Memory Studio')).toBeInTheDocument();
    expect(screen.getByText('1/3 members')).toBeInTheDocument();
    expect(screen.getByText('0 pending · 2 seats left')).toBeInTheDocument();
    expect(screen.queryByText('Sara Johnson')).not.toBeInTheDocument();
    expect(screen.queryByText('Editor')).not.toBeInTheDocument();
  });

  it('hides inviting from members', () => {
    render(
      <TeamClient
        currentUserId="user-2"
        isAdmin={false}
        members={[
          member(),
          member({
            membershipId: 'mem-2',
            userId: 'user-2',
            role: 'MEMBER',
            name: 'Pat',
          }),
        ]}
        invites={[]}
        overview={overview}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Invite a member' })).not.toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('sends an email invite for a real role', async () => {
    const user = userEvent.setup();
    mocks.apiFetch.mockResolvedValue({ ok: true, data: { token: 'invite-token' } });
    render(
      <TeamClient
        currentUserId="user-1"
        isAdmin
        members={[member()]}
        invites={[]}
        overview={overview}
      />,
    );

    await user.type(screen.getByLabelText('Email address'), 'pat@example.com');
    await user.click(screen.getByRole('button', { name: 'Send Invite' }));

    expect(mocks.apiFetch).toHaveBeenCalledWith('/organizations/invites', {
      method: 'POST',
      body: JSON.stringify({ email: 'pat@example.com', role: 'MEMBER' }),
    });
  });
});
