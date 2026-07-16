import { AiProvider } from '@contexual/database';
import { getModel, getModelsForProvider } from './model-catalog';

export const SUPPORTED_OPENAI_MODELS = getModelsForProvider(
  AiProvider.OPENAI,
).map((model) => model.id);

export function estimateCostCents(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = getModel(model);
  if (!pricing) {
    throw new Error(`Pricing is not configured for model ${model}`);
  }

  const cost =
    (promptTokens / 1_000_000) * pricing.inputCentsPerMillion +
    (completionTokens / 1_000_000) * pricing.outputCentsPerMillion;

  return Math.max(0, Math.round(cost));
}
