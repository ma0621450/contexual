'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2Icon, PlugIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import type {
  AiProviderId,
  ConnectedProvider,
  ProviderModel,
  ProviderStatus,
} from '@/lib/api/server';
import {
  connectProviderSchema,
  updateProviderModelsSchema,
} from '@/lib/validations/providers';
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

const PROVIDER_OPTIONS: {
  id: AiProviderId;
  label: string;
  description: string;
  placeholder: string;
}[] = [
  {
    id: 'OPENAI',
    label: 'OpenAI',
    description: 'GPT models for general chat and reasoning.',
    placeholder: 'sk-…',
  },
  {
    id: 'ANTHROPIC',
    label: 'Anthropic',
    description: 'Claude models for careful analysis and writing.',
    placeholder: 'sk-ant-…',
  },
  {
    id: 'GOOGLE',
    label: 'Google Gemini',
    description: 'Gemini models for fast multimodal-ready chat.',
    placeholder: 'AIza…',
  },
  {
    id: 'XAI',
    label: 'xAI',
    description: 'Grok models for fast, up-to-date responses.',
    placeholder: 'xai-…',
  },
];

type ProvidersClientProps = {
  isAdmin: boolean;
  status: ProviderStatus | null;
  models: ProviderModel[];
};

type EditorMode = 'connect' | 'models' | null;

export function ProvidersClient({
  isAdmin,
  status,
  models,
}: ProvidersClientProps) {
  const router = useRouter();
  const [activeProvider, setActiveProvider] = useState<AiProviderId | null>(
    null,
  );
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [enabledModels, setEnabledModels] = useState<string[]>([]);
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const connectedByProvider = useMemo(() => {
    const map = new Map<AiProviderId, ConnectedProvider>();
    for (const item of status?.providers ?? []) {
      map.set(item.provider, item);
    }
    return map;
  }, [status?.providers]);

  function modelsFor(provider: AiProviderId) {
    return models.filter((model) => model.provider === provider);
  }

  function recommendedFor(provider: AiProviderId) {
    const providerModels = modelsFor(provider);
    return (
      providerModels.find((model) => model.isDefault) ?? providerModels[0]
    );
  }

  function startConnect(provider: AiProviderId) {
    const providerModels = modelsFor(provider);
    const recommended = recommendedFor(provider);
    setActiveProvider(provider);
    setEditorMode('connect');
    setApiKey('');
    setDefaultModel(recommended?.id ?? '');
    setEnabledModels(providerModels.map((model) => model.id));
    setFieldError('');
    setFormError('');
    setNotice('');
  }

  function startEditModels(provider: AiProviderId) {
    const connected = connectedByProvider.get(provider);
    const providerModels = modelsFor(provider);
    const recommended = recommendedFor(provider);
    setActiveProvider(provider);
    setEditorMode('models');
    setApiKey('');
    setDefaultModel(
      connected?.defaultModel ?? recommended?.id ?? providerModels[0]?.id ?? '',
    );
    setEnabledModels(
      connected?.enabledModels?.length
        ? connected.enabledModels
        : providerModels.map((model) => model.id),
    );
    setFieldError('');
    setFormError('');
    setNotice('');
  }

  function closeEditor() {
    setActiveProvider(null);
    setEditorMode(null);
    setApiKey('');
    setFieldError('');
  }

  function toggleModel(modelId: string) {
    setEnabledModels((current) => {
      if (current.includes(modelId)) {
        const next = current.filter((id) => id !== modelId);
        if (defaultModel === modelId) {
          setDefaultModel(next[0] ?? '');
        }
        return next;
      }
      return [...current, modelId];
    });
  }

  async function handleConnect(event: React.FormEvent) {
    event.preventDefault();
    if (!activeProvider || pending) return;

    setFieldError('');
    setFormError('');
    setNotice('');

    const parsed = connectProviderSchema.safeParse({
      provider: activeProvider,
      apiKey,
      defaultModel: defaultModel || undefined,
      enabledModels,
    });

    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    setPending(`connect:${activeProvider}`);
    try {
      const result = await apiFetch('/organizations/providers', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      const label =
        PROVIDER_OPTIONS.find((item) => item.id === activeProvider)?.label ??
        'Provider';
      closeEditor();
      setNotice(`${label} connected. Members can use the enabled models.`);
      router.refresh();
    } catch {
      setFormError('Unable to connect provider. Check your connection.');
    } finally {
      setPending(null);
    }
  }

  async function handleSaveModels(event: React.FormEvent) {
    event.preventDefault();
    if (!activeProvider || pending) return;

    setFieldError('');
    setFormError('');
    setNotice('');

    const parsed = updateProviderModelsSchema.safeParse({
      enabledModels,
      defaultModel,
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    setPending(`models:${activeProvider}`);
    try {
      const result = await apiFetch(
        `/organizations/providers/${activeProvider}`,
        {
          method: 'PATCH',
          body: JSON.stringify(parsed.data),
        },
      );
      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      const label =
        PROVIDER_OPTIONS.find((item) => item.id === activeProvider)?.label ??
        'Provider';
      closeEditor();
      setNotice(`${label} model access updated.`);
      router.refresh();
    } catch {
      setFormError('Unable to update models. Check your connection.');
    } finally {
      setPending(null);
    }
  }

  async function handleDisconnect(provider: AiProviderId) {
    if (pending) return;
    setFormError('');
    setNotice('');
    setPending(`disconnect:${provider}`);
    try {
      const result = await apiFetch(`/organizations/providers/${provider}`, {
        method: 'DELETE',
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      if (activeProvider === provider) closeEditor();
      setNotice(
        `${PROVIDER_OPTIONS.find((item) => item.id === provider)?.label ?? 'Provider'} disconnected.`,
      );
      router.refresh();
    } catch {
      setFormError('Unable to disconnect provider. Check your connection.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">AI providers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect providers with your API keys, then choose which models your
          organization can use in chat.
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

      {!isAdmin ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Only organization admins can manage AI providers and model access.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDER_OPTIONS.map((option) => {
          const connected = connectedByProvider.get(option.id);
          const providerModels = modelsFor(option.id);
          const isEditing =
            activeProvider === option.id && editorMode !== null;
          const editingModels = isEditing && editorMode === 'models';
          const editingConnect = isEditing && editorMode === 'connect';

          return (
            <Card key={option.id}>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{option.label}</h3>
                      <Badge variant={connected ? 'success' : 'secondary'}>
                        {connected ? 'Connected' : 'Not connected'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {option.description}
                    </p>
                    {connected ? (
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>
                          Default model:{' '}
                          <span className="text-foreground">
                            {providerModels.find(
                              (model) => model.id === connected.defaultModel,
                            )?.label ?? connected.defaultModel}
                          </span>
                        </p>
                        <p>
                          Enabled:{' '}
                          <span className="text-foreground">
                            {connected.enabledModels.length} model
                            {connected.enabledModels.length === 1 ? '' : 's'}
                          </span>
                          {connected.connectedByName
                            ? ` · Added by ${connected.connectedByName}`
                            : ''}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  {connected ? (
                    <CheckCircle2Icon className="size-5 shrink-0 text-success" />
                  ) : (
                    <PlugIcon className="size-5 shrink-0 text-muted-foreground" />
                  )}
                </div>

                {!isAdmin ? null : connected && !isEditing ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEditModels(option.id)}
                    >
                      Manage models
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startConnect(option.id)}
                    >
                      Update key
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDisconnect(option.id)}
                      disabled={pending === `disconnect:${option.id}`}
                    >
                      {pending === `disconnect:${option.id}`
                        ? 'Disconnecting…'
                        : 'Disconnect'}
                    </Button>
                  </div>
                ) : null}

                {!isAdmin ? null : !connected && !isEditing ? (
                  <Button
                    size="sm"
                    onClick={() => startConnect(option.id)}
                    disabled={Boolean(pending)}
                  >
                    Connect {option.label}
                  </Button>
                ) : null}

                {isAdmin && editingConnect ? (
                  <form onSubmit={handleConnect} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`apiKey-${option.id}`}>API key</Label>
                      <Input
                        id={`apiKey-${option.id}`}
                        type="password"
                        autoComplete="off"
                        value={apiKey}
                        onChange={(event) => {
                          setApiKey(event.target.value);
                          setFieldError('');
                        }}
                        placeholder={option.placeholder}
                        aria-invalid={fieldError ? true : undefined}
                        disabled={pending === `connect:${option.id}`}
                      />
                    </div>

                    <ModelAccessFields
                      providerId={option.id}
                      providerModels={providerModels}
                      enabledModels={enabledModels}
                      defaultModel={defaultModel}
                      disabled={pending === `connect:${option.id}`}
                      onToggle={toggleModel}
                      onDefaultChange={setDefaultModel}
                    />

                    {fieldError ? (
                      <p className="text-sm text-destructive">{fieldError}</p>
                    ) : null}

                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={
                          pending === `connect:${option.id}` ||
                          enabledModels.length === 0
                        }
                      >
                        {pending === `connect:${option.id}`
                          ? 'Validating…'
                          : connected
                            ? 'Save connection'
                            : `Connect ${option.label}`}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={closeEditor}
                      >
                        Cancel
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      We validate the key, store it encrypted, and only expose
                      the models you enable to your team.
                    </p>
                  </form>
                ) : null}

                {isAdmin && editingModels ? (
                  <form onSubmit={handleSaveModels} className="space-y-3">
                    <ModelAccessFields
                      providerId={option.id}
                      providerModels={providerModels}
                      enabledModels={enabledModels}
                      defaultModel={defaultModel}
                      disabled={pending === `models:${option.id}`}
                      onToggle={toggleModel}
                      onDefaultChange={setDefaultModel}
                    />
                    {fieldError ? (
                      <p className="text-sm text-destructive">{fieldError}</p>
                    ) : null}
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={
                          pending === `models:${option.id}` ||
                          enabledModels.length === 0
                        }
                      >
                        {pending === `models:${option.id}`
                          ? 'Saving…'
                          : 'Save model access'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={closeEditor}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ModelAccessFields({
  providerId,
  providerModels,
  enabledModels,
  defaultModel,
  disabled,
  onToggle,
  onDefaultChange,
}: {
  providerId: AiProviderId;
  providerModels: ProviderModel[];
  enabledModels: string[];
  defaultModel: string;
  disabled: boolean;
  onToggle: (modelId: string) => void;
  onDefaultChange: (modelId: string) => void;
}) {
  const enabledOptions = providerModels.filter((model) =>
    enabledModels.includes(model.id),
  );

  return (
    <>
      <div className="space-y-2">
        <Label>Enabled models</Label>
        <div className="space-y-2 rounded-lg border border-border p-3">
          {providerModels.map((model) => {
            const checked = enabledModels.includes(model.id);
            return (
              <label
                key={model.id}
                className="flex cursor-pointer items-start gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggle(model.id)}
                />
                <span className="min-w-0">
                  <span className="font-medium">
                    {model.label}
                    {model.isDefault ? ' ★' : ''}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {model.id}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`defaultModel-${providerId}`}>Default model</Label>
        <Select
          value={defaultModel || undefined}
          onValueChange={onDefaultChange}
          disabled={disabled || enabledOptions.length === 0}
        >
          <SelectTrigger id={`defaultModel-${providerId}`}>
            <SelectValue placeholder="Choose a default model" />
          </SelectTrigger>
          <SelectContent>
            {enabledOptions.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label}
                {model.isDefault ? ' ★' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
