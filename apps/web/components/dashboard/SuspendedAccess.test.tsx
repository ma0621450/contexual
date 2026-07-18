import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SuspendedAccess } from './SuspendedAccess';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

describe('SuspendedAccess', () => {
  it('blocks workspace features and offers only active organizations', () => {
    render(
      <SuspendedAccess
        activeOrganizationId="suspended"
        organizations={[
          {
            id: 'suspended',
            name: 'Locked Workspace',
            slug: 'locked',
            planTier: 'FREE',
            role: 'MEMBER',
            suspended: true,
          },
          {
            id: 'active',
            name: 'Available Workspace',
            slug: 'available',
            planTier: 'FREE',
            role: 'MEMBER',
            suspended: false,
          },
        ]}
      />,
    );

    expect(screen.getByText('Workspace access suspended')).toBeInTheDocument();
    expect(screen.getByText(/Locked Workspace/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Available Workspace' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Locked Workspace' }),
    ).not.toBeInTheDocument();
  });
});
