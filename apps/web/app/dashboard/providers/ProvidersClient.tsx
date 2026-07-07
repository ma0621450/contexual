'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import type { ProviderStatus } from '@/lib/api/server';
import { connectProviderSchema } from '@/lib/validations/providers';

type ProvidersClientProps = {
  isAdmin: boolean;
  status: ProviderStatus | null;
};

export function ProvidersClient({ isAdmin, status }: ProvidersClientProps) {
  const router = useRouter();

  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<'connect' | 'disconnect' | null>(null);

  const connected = status?.connected ?? false;

  async function handleConnect(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    setFieldError('');
    setFormError('');
    setNotice('');

    const parsed = connectProviderSchema.safeParse({
      provider: 'OPENAI',
      apiKey,
      defaultModel: defaultModel || undefined,
    });

    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    setPending('connect');
    try {
      const result = await apiFetch('/organizations/providers', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setApiKey('');
      setDefaultModel('');
      setNotice('Provider connected successfully.');
      router.refresh();
    } catch {
      setFormError('Unable to connect provider. Check your connection.');
    } finally {
      setPending(null);
    }
  }

  async function handleDisconnect() {
    if (pending) return;
    setFormError('');
    setNotice('');
    setPending('disconnect');
    try {
      const result = await apiFetch('/organizations/providers', {
        method: 'DELETE',
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setNotice('Provider disconnected.');
      router.refresh();
    } catch {
      setFormError('Unable to disconnect provider. Check your connection.');
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">
          AI Providers
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Connect your organization&apos;s AI provider. Your team uses this key;
          members never manage their own.
        </p>
      </div>

      {formError ? (
        <p className="mb-4 rounded-lg border border-semantic-error/20 bg-semantic-error/5 px-3 py-2 text-sm text-semantic-error">
          {formError}
        </p>
      ) : null}

      {notice ? (
        <p className="mb-4 rounded-lg border border-brand-primary/20 bg-brand-tint px-3 py-2 text-sm text-brand-primary">
          {notice}
        </p>
      ) : null}

      <section className="rounded-xl border border-border bg-surface-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">OpenAI</h2>
            <p className="mt-1 text-sm text-text-muted">
              {connected
                ? `Connected${status?.defaultModel ? ` · ${status.defaultModel}` : ''}`
                : 'Not connected'}
            </p>
            {connected && status?.connectedByName ? (
              <p className="mt-1 text-xs text-text-muted">
                Added by {status.connectedByName}
              </p>
            ) : null}
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              connected
                ? 'bg-brand-tint text-brand-primary'
                : 'bg-surface-page text-text-muted'
            }`}
          >
            {connected ? 'Active' : 'Inactive'}
          </span>
        </div>

        {!isAdmin ? (
          <p className="mt-4 text-sm text-text-muted">
            Only organization admins can manage AI providers.
          </p>
        ) : connected ? (
          <div className="mt-6">
            <button
              type="button"
              onClick={handleDisconnect}
              className="text-sm font-medium text-semantic-error hover:underline disabled:opacity-60"
              disabled={pending === 'disconnect'}
            >
              {pending === 'disconnect'
                ? 'Disconnecting...'
                : 'Disconnect provider'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleConnect} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="apiKey"
                className="mb-1.5 block text-sm font-medium text-text-primary"
              >
                OpenAI API key
              </label>
              <input
                id="apiKey"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setFieldError('');
                }}
                placeholder="sk-..."
                className={`auth-input ${fieldError ? 'auth-input-error' : ''}`}
                disabled={pending === 'connect'}
              />
              {fieldError ? (
                <p className="mt-1.5 text-sm text-semantic-error">
                  {fieldError}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="defaultModel"
                className="mb-1.5 block text-sm font-medium text-text-primary"
              >
                Default model{' '}
                <span className="text-text-muted">(optional)</span>
              </label>
              <input
                id="defaultModel"
                value={defaultModel}
                onChange={(event) => setDefaultModel(event.target.value)}
                placeholder="gpt-4o-mini"
                className="auth-input"
                disabled={pending === 'connect'}
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={pending === 'connect'}
            >
              {pending === 'connect'
                ? 'Validating and connecting...'
                : 'Connect OpenAI'}
            </button>
            <p className="text-xs text-text-muted">
              We validate the key with OpenAI, then store it encrypted. The key
              is never shown again.
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
