import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UsageSummary } from '@/lib/api/server';
import { UsageClient } from './UsageClient';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const usage: UsageSummary = {
  spendPeriodStartedAt: '2026-07-01T00:00:00.000Z',
  organizationLimits: {
    monthlySpendLimitCents: 0,
    monthlySpendUsedCents: 25,
    monthlyTokenLimit: 0,
    monthlyTokensUsed: 200,
  },
  totals: {
    promptTokens: 100,
    completionTokens: 100,
    estimatedCostCents: 25,
  },
  members: [
    {
      userId: 'admin-1',
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'ADMIN',
      suspended: false,
      spendLimitCents: 0,
      spendUsedCents: 10,
      tokenLimit: 0,
      tokensUsed: 100,
      promptTokens: 50,
      completionTokens: 50,
      estimatedCostCents: 10,
    },
    {
      userId: 'member-1',
      name: 'Member User',
      email: 'member@example.com',
      role: 'MEMBER',
      suspended: false,
      spendLimitCents: 0,
      spendUsedCents: 15,
      tokenLimit: 0,
      tokensUsed: 100,
      promptTokens: 50,
      completionTokens: 50,
      estimatedCostCents: 15,
    },
  ],
};

describe('UsageClient member controls', () => {
  it('does not allow an administrator to suspend themselves', () => {
    render(
      <UsageClient
        isAdmin
        myUsage={null}
        usage={usage}
        overview={null}
        billing={null}
        currentUserId="admin-1"
        billingNotice={null}
      />,
    );

    const selfRow = screen.getByText('Admin User').closest('tr');
    const memberRow = screen.getByText('Member User').closest('tr');
    expect(selfRow).not.toBeNull();
    expect(memberRow).not.toBeNull();
    expect(within(selfRow!).getByText('You')).toBeInTheDocument();
    expect(
      within(selfRow!).queryByRole('button', { name: 'Suspend' }),
    ).not.toBeInTheDocument();
    expect(
      within(memberRow!).getByRole('button', { name: 'Suspend' }),
    ).toBeInTheDocument();
  });

  it('shows a member only their own usage without admin controls', () => {
    render(
      <UsageClient
        isAdmin={false}
        myUsage={null}
        usage={null}
        overview={null}
        billing={null}
        currentUserId="member-1"
        billingNotice={null}
      />,
    );

    expect(screen.getAllByText('My usage').length).toBeGreaterThan(0);
    expect(screen.queryByText('Per-member usage')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Organization monthly limits'),
    ).not.toBeInTheDocument();
  });
});
