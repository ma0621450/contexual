import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationSummary, MemoryItem, StoredFile } from '@/lib/api/server';
import { JoinInviteForm } from './JoinInviteForm';
import { OverviewView } from './OverviewView';

const push = vi.fn();
const refresh = vi.fn();
const apiFetch = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
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

vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const conversation = {
  id: 'c1',
  title: 'Launch plan',
  model: 'gpt',
  provider: 'OPENAI',
  updatedAt: '2026-10-19T00:00:00.000Z',
  isArchived: false,
} satisfies ConversationSummary;

const file = {
  id: 'f1',
  filename: 'brief.pdf',
  mimeType: 'application/pdf',
  detectedMimeType: null,
  sizeBytes: 10,
  processingStatus: 'READY',
  scanBypassed: false,
  failureCode: null,
  failureMessage: null,
  uploadedById: 'u1',
  createdAt: '2026-10-19T00:00:00.000Z',
  updatedAt: '2026-10-19T00:00:00.000Z',
} satisfies StoredFile;

const memory = {
  id: 'm1',
  organizationId: 'o1',
  userId: 'u1',
  scope: 'USER',
  title: 'Brand voice',
  content: 'Plain language',
  enabled: true,
  createdAt: '2026-10-19T00:00:00.000Z',
  updatedAt: '2026-10-19T00:00:00.000Z',
} satisfies MemoryItem;

describe('OverviewView', () => {
  it('renders the signed-in name and real workspace records', () => {
    render(
      <OverviewView
        firstName="Meher"
        providerConnected
        conversations={[conversation]}
        files={[file]}
        memories={[memory]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Hello, Meher' })).toBeInTheDocument();
    expect(screen.getByText('Launch plan')).toBeInTheDocument();
    expect(screen.getByText('brief.pdf')).toBeInTheDocument();
    expect(screen.getByText('Brand voice')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    expect(screen.queryByRole('link', { name: /Connect an AI provider/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Chrome Extension/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/calendar/i)).not.toBeInTheDocument();
  });

  it('links incomplete setup steps and shows empty workspace copy', () => {
    render(
      <OverviewView
        firstName="there"
        providerConnected={false}
        conversations={[]}
        files={[]}
        memories={[]}
      />,
    );

    expect(screen.getByRole('link', { name: /Connect an AI provider/ })).toHaveAttribute(
      'href',
      '/dashboard/providers',
    );
    expect(screen.getByRole('link', { name: /Start a chat/ })).toHaveAttribute(
      'href',
      '/dashboard/chat',
    );
    expect(screen.getByRole('link', { name: 'Open chat' })).toHaveAttribute(
      'href',
      '/dashboard/chat',
    );
    expect(screen.getByRole('link', { name: 'Add files' })).toHaveAttribute(
      'href',
      '/dashboard/files',
    );
    expect(screen.getByRole('link', { name: 'Add a memory' })).toHaveAttribute(
      'href',
      '/dashboard/memories',
    );
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    expect(screen.getByText('No files yet')).toBeInTheDocument();
    expect(screen.getByText('No memories yet')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });

  it('says when provider status failed to load', () => {
    render(
      <OverviewView
        firstName="Ada"
        providerConnected={null}
        conversations={[]}
        files={[]}
        memories={[]}
      />,
    );

    expect(screen.getByText('Provider status could not be loaded.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Connect an AI provider/ })).toBeInTheDocument();
  });

  it('hides archived conversations from the chat card', () => {
    render(
      <OverviewView
        firstName="Ada"
        providerConnected={false}
        conversations={[{ ...conversation, isArchived: true }]}
        files={[]}
        memories={[]}
      />,
    );

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    expect(screen.queryByText('Launch plan')).not.toBeInTheDocument();
  });
});

describe('JoinInviteForm', () => {
  it('rejects an empty invite before calling the API', async () => {
    const user = userEvent.setup();
    apiFetch.mockReset();
    render(<JoinInviteForm />);

    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter an invite link or code.');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('posts the token from a pasted invite link', async () => {
    const user = userEvent.setup();
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({
      ok: true,
      data: { redirectTo: '/dashboard' },
    });
    push.mockReset();
    render(<JoinInviteForm />);

    await user.type(
      screen.getByLabelText('Invite code or link'),
      'https://promplex.app/onboarding?invite=invite-token',
    );
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(apiFetch).toHaveBeenCalledWith('/onboarding/join-organization', {
      method: 'POST',
      body: JSON.stringify({ token: 'invite-token' }),
    });
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('shows the API error and stays on the page', async () => {
    const user = userEvent.setup();
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({
      ok: false,
      error: 'This invitation was sent to other@example.com. Sign in with that email address to accept it.',
    });
    push.mockReset();
    render(<JoinInviteForm />);

    await user.type(screen.getByLabelText('Invite code or link'), 'raw-token');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This invitation was sent to other@example.com',
    );
    expect(push).not.toHaveBeenCalled();
  });
});
