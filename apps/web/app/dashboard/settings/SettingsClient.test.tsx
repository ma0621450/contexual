import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsClient } from './SettingsClient';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));

describe('SettingsClient validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an empty profile name before making a request', async () => {
    render(<SettingsClient name="Member" email="member@example.com" />);
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords before making a request', async () => {
    render(<SettingsClient name="Member" email="member@example.com" />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Change Password' }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.type(
      within(dialog).getByLabelText('Current password'),
      'old-password',
    );
    await userEvent.type(
      within(dialog).getByLabelText('New password'),
      'new-password',
    );
    await userEvent.type(
      within(dialog).getByLabelText('Confirm new password'),
      'different-password',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Change Password' }),
    );

    expect(screen.getByText('New passwords do not match')).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
});
