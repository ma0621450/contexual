import { AiProvider } from '@contexual/database';

export type ModelCatalogEntry = {
  id: string;
  provider: AiProvider;
  label: string;
  inputCentsPerMillion: number;
  outputCentsPerMillion: number;
  contextWindow: number;
  recommended?: boolean;
};

/**
 * Curated chat models. IDs/pricing last verified against provider docs (Aug 2026).
 * Keep this list short and GA-only — preview/invite-only models stay out.
 */
export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  // OpenAI — https://developers.openai.com/api/docs/models
  {
    id: 'gpt-5.6-luna',
    provider: AiProvider.OPENAI,
    label: 'GPT-5.6 Luna',
    inputCentsPerMillion: 20,
    outputCentsPerMillion: 120,
    contextWindow: 1_050_000,
    recommended: true,
  },
  {
    id: 'gpt-5.6-terra',
    provider: AiProvider.OPENAI,
    label: 'GPT-5.6 Terra',
    inputCentsPerMillion: 200,
    outputCentsPerMillion: 1200,
    contextWindow: 1_050_000,
  },
  {
    id: 'gpt-5.6-sol',
    provider: AiProvider.OPENAI,
    label: 'GPT-5.6 Sol',
    inputCentsPerMillion: 500,
    outputCentsPerMillion: 3000,
    contextWindow: 1_050_000,
  },

  // Anthropic — https://docs.anthropic.com/en/docs/about-claude/models/overview
  {
    id: 'claude-sonnet-5',
    provider: AiProvider.ANTHROPIC,
    label: 'Claude Sonnet 5',
    inputCentsPerMillion: 300,
    outputCentsPerMillion: 1500,
    contextWindow: 1_000_000,
    recommended: true,
  },
  {
    id: 'claude-haiku-4-5',
    provider: AiProvider.ANTHROPIC,
    label: 'Claude Haiku 4.5',
    inputCentsPerMillion: 100,
    outputCentsPerMillion: 500,
    contextWindow: 200_000,
  },
  {
    id: 'claude-opus-5',
    provider: AiProvider.ANTHROPIC,
    label: 'Claude Opus 5',
    inputCentsPerMillion: 500,
    outputCentsPerMillion: 2500,
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-fable-5',
    provider: AiProvider.ANTHROPIC,
    label: 'Claude Fable 5',
    inputCentsPerMillion: 1000,
    outputCentsPerMillion: 5000,
    contextWindow: 1_000_000,
  },

  // Google — https://ai.google.dev/gemini-api/docs/pricing
  {
    id: 'gemini-3.5-flash-lite',
    provider: AiProvider.GOOGLE,
    label: 'Gemini 3.5 Flash-Lite',
    inputCentsPerMillion: 30,
    outputCentsPerMillion: 250,
    contextWindow: 1_000_000,
    recommended: true,
  },
  {
    id: 'gemini-3.6-flash',
    provider: AiProvider.GOOGLE,
    label: 'Gemini 3.6 Flash',
    inputCentsPerMillion: 150,
    outputCentsPerMillion: 750,
    contextWindow: 1_000_000,
  },
  {
    id: 'gemini-2.5-pro',
    provider: AiProvider.GOOGLE,
    label: 'Gemini 2.5 Pro',
    inputCentsPerMillion: 125,
    outputCentsPerMillion: 1000,
    contextWindow: 1_000_000,
  },

  // xAI — https://docs.x.ai/developers/models
  {
    id: 'grok-4.3',
    provider: AiProvider.XAI,
    label: 'Grok 4.3',
    inputCentsPerMillion: 125,
    outputCentsPerMillion: 250,
    contextWindow: 1_000_000,
    recommended: true,
  },
  {
    id: 'grok-4.5',
    provider: AiProvider.XAI,
    label: 'Grok 4.5',
    inputCentsPerMillion: 200,
    outputCentsPerMillion: 600,
    contextWindow: 500_000,
  },
  {
    id: 'grok-build-0.1',
    provider: AiProvider.XAI,
    label: 'Grok Build 0.1',
    inputCentsPerMillion: 100,
    outputCentsPerMillion: 200,
    contextWindow: 256_000,
  },
] as const;

export const SUPPORTED_MODEL_IDS = MODEL_CATALOG.map((model) => model.id);

export function getModelsForProvider(provider: AiProvider) {
  return MODEL_CATALOG.filter((model) => model.provider === provider);
}

export function getDefaultModel(provider: AiProvider): string {
  const models = getModelsForProvider(provider);
  const recommended = models.find((model) => model.recommended);
  const model = recommended ?? models[0];
  if (!model) throw new Error(`No models configured for ${provider}`);
  return model.id;
}

export function getModel(modelId: string): ModelCatalogEntry | undefined {
  return MODEL_CATALOG.find((model) => model.id === modelId);
}

export function isModelForProvider(
  modelId: string,
  provider: AiProvider,
): boolean {
  return getModel(modelId)?.provider === provider;
}

export function getProviderForModel(modelId: string): AiProvider | undefined {
  return getModel(modelId)?.provider;
}
