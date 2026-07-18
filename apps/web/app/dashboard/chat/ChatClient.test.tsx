import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderModel } from '@/lib/api/server';
import { ChatClient } from './ChatClient';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
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
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

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
      provider="OPENAI"
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
});
