'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import type {
  AiProviderId,
  ProviderModel,
  ProviderStatus,
} from '@/lib/api/server';
import { connectProviderSchema } from '@/lib/validations/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PROVIDER_LABELS: Record<AiProviderId, string> = {
  OPENAI: 'OpenAI',
  ANTHROPIC: 'Anthropic',
  GOOGLE: 'Google Gemini',
  XAI: 'xAI',
};

type ProvidersClientProps = {
  isAdmin: boolean;
  status: ProviderStatus | null;
  models: ProviderModel[];
};

export function ProvidersClient({
  isAdmin,
  status,
  models,
}: ProvidersClientProps) {
  const router = useRouter();

  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<AiProviderId>('OPENAI');
  const [defaultModel, setDefaultModel] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<'connect' | 'disconnect' | null>(null);

  const connected = status?.connected ?? false;
  const providerModels = models.filter((model) => model.provider === provider);
  const recommendedModel =
    providerModels.find((model) => model.isDefault) ?? providerModels[0];

  async function handleConnect(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    setFieldError('');
    setFormError('');
    setNotice('');

    const parsed = connectProviderSchema.safeParse({
      provider,
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
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">AI providers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your organization&apos;s AI provider. Your team uses this key;
          members never manage their own.
        </p>
      </div>

      {formError ? (
        <p className="mb-4 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      {notice ? (
        <p className="mb-4 rounded-lg border border-border bg-accent px-3 py-2 text-sm text-accent-foreground">
          {notice}
        </p>
      ) : null}

      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">
                {connected
                  ? (PROVIDER_LABELS[status?.provider as AiProviderId] ??
                    status?.provider)
                  : 'AI provider'}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {connected
                  ? `Connected${status?.defaultModel ? ` · ${status.defaultModel}` : ''}`
                  : 'Not connected'}
              </p>
              {connected && status?.connectedByName ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Added by {status.connectedByName}
                </p>
              ) : null}
            </div>
            <Badge variant={connected ? 'success' : 'secondary'}>
              {connected ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          {!isAdmin ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Only organization admins can manage AI providers.
            </p>
          ) : connected ? (
            <div className="mt-6">
              <Button
                variant="outline"
                className="text-destructive"
                onClick={handleDisconnect}
                disabled={pending === 'disconnect'}
              >
                {pending === 'disconnect'
                  ? 'Disconnecting…'
                  : 'Disconnect provider'}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleConnect} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="provider">Provider</Label>
                <Select
                  value={provider}
                  onValueChange={(value) => {
                    setProvider(value as AiProviderId);
                    setDefaultModel('');
                  }}
                >
                  <SelectTrigger id="provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPENAI">OpenAI</SelectItem>
                    <SelectItem value="ANTHROPIC">Anthropic</SelectItem>
                    <SelectItem value="GOOGLE">Google Gemini</SelectItem>
                    <SelectItem value="XAI">xAI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="apiKey">Provider API key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setFieldError('');
                  }}
                  placeholder="sk-…"
                  aria-invalid={fieldError ? true : undefined}
                  disabled={pending === 'connect'}
                />
                {fieldError ? (
                  <p className="text-sm text-destructive">{fieldError}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="defaultModel">
                  Default model{' '}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Select
                  value={defaultModel || '__default__'}
                  onValueChange={(value) =>
                    setDefaultModel(value === '__default__' ? '' : value)
                  }
                  disabled={pending === 'connect'}
                >
                  <SelectTrigger id="defaultModel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">
                      {recommendedModel?.label ?? 'Provider default'}{' '}
                      (recommended)
                    </SelectItem>
                    {providerModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" disabled={pending === 'connect'}>
                {pending === 'connect'
                  ? 'Validating and connecting…'
                  : `Connect ${PROVIDER_LABELS[provider]}`}
              </Button>
              <p className="text-xs text-muted-foreground">
                We validate the key with the provider, then store it encrypted.
                The key is never shown again.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
