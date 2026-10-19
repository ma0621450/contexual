import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderModel } from '@/lib/api/server';
import { ProvidersClient } from './ProvidersClient';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

const models: ProviderModel[] = [
  {
    id: 'gpt-4.1',
    provider: 'OPENAI',
    label: 'GPT-4.1',
    contextWindow: 128000,
    isDefault: true,
  },
];

describe('ProvidersClient', () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
  });

  it('shows the connectable providers and no sample brands', () => {
    render(
      <ProvidersClient
        isAdmin
        status={{ connected: false, providers: [], provider: null, defaultModel: null, connectedAt: null, connectedByName: null }}
        models={models}
      />,
    );

    expect(screen.getByRole('heading', { name: 'AI providers' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'OpenAI' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Anthropic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Google' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'xAI' })).toBeInTheDocument();
    expect(screen.queryByText('DeepMind')).not.toBeInTheDocument();
    expect(screen.queryByText('Cohere')).not.toBeInTheDocument();
  });

  it('asks for a real API key before connecting', async () => {
    const user = userEvent.setup();
    render(
      <ProvidersClient
        isAdmin
        status={{ connected: false, providers: [], provider: null, defaultModel: null, connectedAt: null, connectedByName: null }}
        models={models}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Connect' })[0]);
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('API key'), 'too-short');
    await user.click(within(dialog).getByRole('button', { name: 'Connect' }));

    expect(screen.getByText('The API key looks too short')).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
});
