'use client';

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckIcon, KeyboardIcon, PlugIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  badge: string;
  description: string;
  logo: string;
}[] = [
  {
    id: 'OPENAI',
    label: 'OpenAI',
    badge: 'GPT',
    description:
      'Connect a key, then choose which GPT models your organization can use in chat.',
    logo: '/brand/providers/openai.svg',
  },
  {
    id: 'ANTHROPIC',
    label: 'Anthropic',
    badge: 'Claude',
    description:
      'Claude models for careful writing, review, and longer pieces of work.',
    logo: '/brand/providers/anthropic.svg',
  },
  {
    id: 'GOOGLE',
    label: 'Google',
    badge: 'Gemini',
    description:
      'Gemini models for fast replies when the organization uses a Google key.',
    logo: '/brand/providers/google.svg',
  },
  {
    id: 'XAI',
    label: 'xAI',
    badge: 'Grok',
    description:
      'Grok models for direct, quick chat once an xAI key is connected.',
    logo: '/brand/providers/xai.svg',
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

  const activeOption = PROVIDER_OPTIONS.find((item) => item.id === activeProvider);
  const activeConnected = activeProvider
    ? connectedByProvider.get(activeProvider)
    : undefined;

  return (
    <div className="mx-auto w-full max-w-[1118px] px-4 pt-8 pb-10 sm:px-6">
      <div>
        <h1 className="text-[32px] leading-10 font-semibold tracking-[-1.2px] text-white sm:text-[48px] sm:leading-[56px] sm:tracking-[-1.92px]">
          AI providers
        </h1>
        <p className="mt-1 max-w-xl text-sm text-[#a1a1aa]">
          Connect providers with your API keys, then choose which models your
          organization can use in chat.
        </p>
      </div>

      {formError ? (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-6 text-sm text-[#d4d4d8]">
          {notice}
        </p>
      ) : null}
      {!isAdmin ? (
        <p className="mt-6 text-sm text-[#a1a1aa]">
          Only organization admins can manage AI providers and model access.
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {PROVIDER_OPTIONS.map((option) => {
          const connected = connectedByProvider.get(option.id);
          return (
            <article
              key={option.id}
              className="flex min-h-[220px] flex-col rounded-2xl border border-white/10 bg-[#161616] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-black/30">
                  <img
                    src={option.logo}
                    alt=""
                    width={22}
                    height={22}
                    className="size-[22px]"
                  />
                </span>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-[#d4d4d8]">
                  {connected ? 'Connected' : option.badge}
                </span>
              </div>
              <h2 className="mt-4 text-[18px] font-semibold text-white">
                {option.label}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-5 text-[#a1a1aa]">
                {option.description}
              </p>
              {connected ? (
                <p className="mt-2 text-xs text-[#8b8b93]">
                  {connected.enabledModels.length} model
                  {connected.enabledModels.length === 1 ? '' : 's'} enabled
                </p>
              ) : null}
              {isAdmin ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() =>
                      connected
                        ? startEditModels(option.id)
                        : startConnect(option.id)
                    }
                    disabled={Boolean(pending)}
                    className="h-9 rounded-lg bg-[#2a2a2a] px-3 text-sm text-white hover:bg-[#333333]"
                  >
                    <PlugIcon />
                    {connected ? 'Manage' : 'Connect'}
                  </Button>
                  {connected ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => startConnect(option.id)}
                      className="h-9 text-[#a1a1aa] hover:bg-white/5 hover:text-white"
                    >
                      Update key
                    </Button>
                  ) : null}
                  {connected ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void handleDisconnect(option.id)}
                      disabled={pending === `disconnect:${option.id}`}
                      className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {pending === `disconnect:${option.id}`
                        ? 'Disconnecting…'
                        : 'Disconnect'}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <Dialog
        open={activeOption !== undefined && editorMode !== null}
        onOpenChange={(open) => {
          if (!open && !pending) closeEditor();
        }}
      >
        <DialogContent
          className="gap-5 rounded-2xl border-white/10 bg-[#161616] p-6 text-white shadow-2xl sm:max-w-[440px]"
          style={{ backgroundColor: '#161616' }}
        >
          {activeOption && activeProvider ? (
            <>
              <DialogHeader className="pr-8">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/40">
                    <img
                      src={activeOption.logo}
                      alt=""
                      width={18}
                      height={18}
                      className="size-[18px]"
                    />
                  </span>
                  <DialogTitle className="text-[22px] font-semibold tracking-[-0.4px] text-white">
                    {activeOption.label}
                  </DialogTitle>
                </div>
              </DialogHeader>
              <p className="-mt-2 text-sm leading-6 text-[#a1a1aa]">
                {activeOption.description}
              </p>
              {editorMode === 'connect' ? (
                <form onSubmit={handleConnect} className="mt-2 space-y-4">
                  <div className="relative">
                    <KeyboardIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8b8b93]" />
                    <Input
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      onChange={(event) => {
                        setApiKey(event.target.value);
                        setFieldError('');
                      }}
                      placeholder="Please enter API key"
                      aria-label="API key"
                      aria-invalid={fieldError ? true : undefined}
                      disabled={pending === `connect:${activeProvider}`}
                      className="h-10 border-white/10 bg-transparent pl-10"
                    />
                  </div>
                  {fieldError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {fieldError}
                    </p>
                  ) : null}
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={
                        pending === `connect:${activeProvider}` ||
                        enabledModels.length === 0
                      }
                      className="h-9 rounded-lg bg-[#2a2a2a] px-4 text-white hover:bg-[#333333]"
                    >
                      <PlugIcon />
                      {pending === `connect:${activeProvider}`
                        ? 'Validating…'
                        : activeConnected
                          ? 'Save'
                          : 'Connect'}
                    </Button>
                  </div>
                  <p className="text-xs text-[#8b8b93]">
                    The key is validated and stored encrypted. Every model for
                    this provider is enabled until you manage the list.
                  </p>
                </form>
              ) : (
                <form onSubmit={handleSaveModels} className="space-y-5">
                  <ModelAccessFields
                    providerId={activeProvider}
                    providerModels={modelsFor(activeProvider)}
                    enabledModels={enabledModels}
                    defaultModel={defaultModel}
                    disabled={pending === `models:${activeProvider}`}
                    onToggle={toggleModel}
                    onDefaultChange={setDefaultModel}
                  />
                  {fieldError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {fieldError}
                    </p>
                  ) : null}
                  <div className="flex justify-end border-t border-white/10 pt-4">
                    <Button
                      type="submit"
                      disabled={
                        pending === `models:${activeProvider}` ||
                        enabledModels.length === 0
                      }
                      className="h-9 rounded-lg bg-white px-4 text-sm font-medium text-[#111111] hover:bg-white/90"
                    >
                      {pending === `models:${activeProvider}`
                        ? 'Saving…'
                        : 'Save model access'}
                    </Button>
                  </div>
                </form>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
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
        <div className="flex items-baseline justify-between gap-3">
          <Label className="text-[13px] font-medium text-white">
            Enabled models
          </Label>
          <span className="text-xs text-[#8b8b93]">
            {enabledModels.length} of {providerModels.length}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-black/25 p-1.5">
          {providerModels.map((model) => {
            const checked = enabledModels.includes(model.id);
            return (
              <label
                key={model.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors',
                  checked ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggle(model.id)}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                    checked
                      ? 'border-white bg-white text-[#111111]'
                      : 'border-white/25 bg-transparent',
                  )}
                >
                  {checked ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">
                      {model.label}
                    </span>
                    {model.isDefault ? (
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-[#d4d4d8] uppercase">
                        Recommended
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[#8b8b93]">
                    {model.id}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor={`defaultModel-${providerId}`}
          className="text-[13px] font-medium text-white"
        >
          Default model
        </Label>
        <Select
          value={defaultModel || undefined}
          onValueChange={onDefaultChange}
          disabled={disabled || enabledOptions.length === 0}
        >
          <SelectTrigger
            id={`defaultModel-${providerId}`}
            className="h-10 rounded-lg border-white/10 bg-black/25"
          >
            <SelectValue placeholder="Choose a default model" />
          </SelectTrigger>
          <SelectContent>
            {enabledOptions.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label}
                {model.isDefault ? ' · Recommended' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
