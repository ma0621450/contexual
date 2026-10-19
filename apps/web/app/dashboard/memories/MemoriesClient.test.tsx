import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryItem } from '@/lib/api/server';
import { MemoriesClient } from './MemoriesClient';

const apiFetch = vi.fn();

vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

function memory(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-1',
    scope: 'USER',
    title: 'Preferred stack',
    content: 'Use Next.js and Postgres.',
    enabled: true,
    createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-16T12:00:00.000Z',
    ...overrides,
  };
}

describe('MemoriesClient', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('shows an empty library without sample memories', () => {
    render(<MemoriesClient isAdmin={false} initialMemories={[]} />);

    expect(screen.getByRole('heading', { name: 'Memories' })).toBeInTheDocument();
    expect(screen.getAllByText('No memories yet')).toHaveLength(2);
    expect(screen.queryByText('Q4_Budget_Forecast.xlsx')).not.toBeInTheDocument();
  });

  it('creates a personal memory and lists it', async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({ ok: true, data: memory() });
    render(<MemoriesClient isAdmin={false} initialMemories={[]} />);

    await user.click(screen.getByRole('button', { name: 'Add memory' }));
    await user.type(screen.getByLabelText('Title'), 'Preferred stack');
    await user.type(
      screen.getByLabelText('What to remember'),
      'Use Next.js and Postgres.',
    );
    expect(screen.queryByLabelText('Who can use it')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save memory' }));

    expect(apiFetch).toHaveBeenCalledWith('/memories', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Preferred stack',
        content: 'Use Next.js and Postgres.',
        scope: 'USER',
      }),
    });
    expect(await screen.findByText('Preferred stack')).toBeInTheDocument();
  });

  it('turns a memory off for later chats', async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({
      ok: true,
      data: memory({ enabled: false }),
    });
    render(<MemoriesClient isAdmin initialMemories={[memory()]} />);

    await user.click(screen.getByRole('button', { name: 'Open Preferred stack' }));
    await user.click(
      screen.getByRole('switch', { name: 'Use Preferred stack in chats' }),
    );

    expect(apiFetch).toHaveBeenCalledWith('/memories/mem-1', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
    });
  });

  it('does not save the chat-generation preference', async () => {
    const user = userEvent.setup();
    render(<MemoriesClient isAdmin={false} initialMemories={[]} />);

    await user.click(
      screen.getByRole('switch', { name: 'Generate memory from chats' }),
    );

    expect(
      screen.getByText('This preference is not saved. Promplex does not store it yet.'),
    ).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
