import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderModel } from '@/lib/api/server';
import { ChatClient } from './ChatClient';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
  streamChat: vi.fn(),
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
    disabled,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <select
      aria-label="Chat model"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      disabled={disabled}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectLabel: () => null,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

import { apiFetch } from '@/lib/api/client';

const models: ProviderModel[] = [
  {
    id: 'gpt-default',
    provider: 'OPENAI',
    label: 'Default OpenAI',
    contextWindow: 128000,
    isDefault: true,
  },
  {
    id: 'gpt-configured',
    provider: 'OPENAI',
    label: 'Configured OpenAI',
    contextWindow: 128000,
    isDefault: false,
  },
  {
    id: 'claude-default',
    provider: 'ANTHROPIC',
    label: 'Claude',
    contextWindow: 200000,
    isDefault: true,
  },
];

function renderChat(defaultModel: string | null) {
  render(
    <ChatClient
      initialConversations={[]}
      providerConnected
      connectedProviders={[
        {
          provider: 'OPENAI',
          defaultModel: 'gpt-configured',
          enabledModels: ['gpt-default', 'gpt-configured'],
        },
      ]}
      defaultModel={defaultModel}
      models={models}
      initialFiles={[]}
      isAdmin
    />,
  );
}

describe('ChatClient model catalog', () => {
  it('selects the configured provider model and filters other providers', () => {
    renderChat('gpt-configured');

    const model = screen.getByRole('combobox', { name: 'Chat model' });
    expect(model).toHaveValue('gpt-configured');
    expect(
      screen.getByRole('option', { name: 'Configured OpenAI' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Claude' }),
    ).not.toBeInTheDocument();
  });

  it('falls back to the catalog default for an invalid configured model', () => {
    renderChat('removed-model');
    expect(screen.getByRole('combobox', { name: 'Chat model' })).toHaveValue(
      'gpt-default',
    );
  });

  it('only lists models enabled by the organization admin', () => {
    render(
      <ChatClient
        initialConversations={[]}
        providerConnected
        connectedProviders={[
          {
            provider: 'OPENAI',
            defaultModel: 'gpt-configured',
            enabledModels: ['gpt-configured'],
          },
        ]}
        defaultModel="gpt-configured"
        models={models}
        initialFiles={[]}
        isAdmin
      />,
    );

    expect(
      screen.getByRole('option', { name: 'Configured OpenAI' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Default OpenAI' }),
    ).not.toBeInTheDocument();
  });

  it('renders assistant markdown as formatted content instead of raw syntax', async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      data: {
        id: 'conversation-1',
        title: 'Prior chat',
        model: 'gpt-configured',
        provider: 'OPENAI',
        messages: [
          {
            id: 'msg-1',
            role: 'ASSISTANT',
            content: [
              '## Launch plan',
              '',
              '1. **Before Launch**',
              '   - Estimate AWS cost',
              '',
              '| Item | Cost |',
              '| --- | --- |',
              '| AWS | $10 |',
              '',
              '```ts',
              'const total = 10;',
              '```',
            ].join('\n'),
            createdAt: new Date().toISOString(),
            attachments: [],
          },
        ],
      },
    });

    render(
      <ChatClient
        initialConversations={[
          {
            id: 'conversation-1',
            title: 'Prior chat',
            model: 'gpt-configured',
            provider: 'OPENAI',
            updatedAt: new Date().toISOString(),
          },
        ]}
        providerConnected
        connectedProviders={[
          {
            provider: 'OPENAI',
            defaultModel: 'gpt-configured',
            enabledModels: ['gpt-default', 'gpt-configured'],
          },
        ]}
        defaultModel="gpt-configured"
        models={models}
        initialFiles={[]}
        isAdmin
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Prior chat' }));

    expect(
      await screen.findByRole('heading', { name: 'Launch plan' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Before Launch').tagName).toBe('STRONG');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '$10' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy code' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\*\*Before Launch\*\*/)).not.toBeInTheDocument();
  });

  it('keeps the model picker enabled after a conversation is opened', async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      data: {
        id: 'conversation-1',
        title: 'Prior chat',
        model: 'gpt-configured',
        provider: 'OPENAI',
        messages: [
          {
            id: 'msg-1',
            role: 'USER',
            content: 'Hello',
            createdAt: new Date().toISOString(),
            attachments: [],
          },
        ],
      },
    });

    render(
      <ChatClient
        initialConversations={[
          {
            id: 'conversation-1',
            title: 'Prior chat',
            model: 'gpt-configured',
            provider: 'OPENAI',
            updatedAt: new Date().toISOString(),
          },
        ]}
        providerConnected
        connectedProviders={[
          {
            provider: 'OPENAI',
            defaultModel: 'gpt-configured',
            enabledModels: ['gpt-default', 'gpt-configured'],
          },
          {
            provider: 'ANTHROPIC',
            defaultModel: 'claude-default',
            enabledModels: ['claude-default'],
          },
        ]}
        defaultModel="gpt-configured"
        models={models}
        initialFiles={[]}
        isAdmin
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Prior chat' }));

    const model = screen.getByRole('combobox', { name: 'Chat model' });
    await waitFor(() => {
      expect(model).toBeEnabled();
      expect(model).toHaveValue('gpt-configured');
    });

    await user.selectOptions(model, 'claude-default');
    expect(model).toHaveValue('claude-default');
  });
});
