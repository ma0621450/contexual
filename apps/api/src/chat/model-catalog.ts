import { AiProvider } from '@contexual/database';

export type ModelCatalogEntry = {
  id: string;
  provider: AiProvider;
  label: string;
  inputCentsPerMillion: number;
  outputCentsPerMillion: number;
  contextWindow: number;
};

export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  {
    id: 'gpt-4o-mini',
    provider: AiProvider.OPENAI,
    label: 'GPT-4o mini',
    inputCentsPerMillion: 15,
    outputCentsPerMillion: 60,
    contextWindow: 128_000,
  },
  {
    id: 'gpt-4o',
    provider: AiProvider.OPENAI,
    label: 'GPT-4o',
    inputCentsPerMillion: 250,
    outputCentsPerMillion: 1000,
    contextWindow: 128_000,
  },
  {
    id: 'gpt-4.1',
    provider: AiProvider.OPENAI,
    label: 'GPT-4.1',
    inputCentsPerMillion: 200,
    outputCentsPerMillion: 800,
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-3-5-haiku-latest',
    provider: AiProvider.ANTHROPIC,
    label: 'Claude 3.5 Haiku',
    inputCentsPerMillion: 80,
    outputCentsPerMillion: 400,
    contextWindow: 200_000,
  },
  {
    id: 'claude-sonnet-4-20250514',
    provider: AiProvider.ANTHROPIC,
    label: 'Claude Sonnet 4',
    inputCentsPerMillion: 300,
    outputCentsPerMillion: 1500,
    contextWindow: 200_000,
  },
  {
    id: 'gemini-2.0-flash',
    provider: AiProvider.GOOGLE,
    label: 'Gemini 2.0 Flash',
    inputCentsPerMillion: 10,
    outputCentsPerMillion: 40,
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
  {
    id: 'grok-3-mini',
    provider: AiProvider.XAI,
    label: 'Grok 3 mini',
    inputCentsPerMillion: 30,
    outputCentsPerMillion: 50,
    contextWindow: 131_072,
  },
  {
    id: 'grok-3',
    provider: AiProvider.XAI,
    label: 'Grok 3',
    inputCentsPerMillion: 300,
    outputCentsPerMillion: 1500,
    contextWindow: 131_072,
  },
] as const;

export const SUPPORTED_MODEL_IDS = MODEL_CATALOG.map((model) => model.id);

export function getModelsForProvider(provider: AiProvider) {
  return MODEL_CATALOG.filter((model) => model.provider === provider);
}

export function getDefaultModel(provider: AiProvider): string {
  const model = getModelsForProvider(provider)[0];
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
