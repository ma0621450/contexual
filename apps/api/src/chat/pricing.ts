type ModelPricing = {
  inputCentsPerMillion: number;
  outputCentsPerMillion: number;
};

const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4o-mini': { inputCentsPerMillion: 15, outputCentsPerMillion: 60 },
  'gpt-4o': { inputCentsPerMillion: 250, outputCentsPerMillion: 1000 },
  'gpt-4.1': { inputCentsPerMillion: 200, outputCentsPerMillion: 800 },
  'gpt-4.1-mini': { inputCentsPerMillion: 40, outputCentsPerMillion: 160 },
};

const FALLBACK_PRICING: ModelPricing = {
  inputCentsPerMillion: 50,
  outputCentsPerMillion: 150,
};

export function estimateCostCents(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = MODEL_PRICING[model] ?? FALLBACK_PRICING;

  const cost =
    (promptTokens / 1_000_000) * pricing.inputCentsPerMillion +
    (completionTokens / 1_000_000) * pricing.outputCentsPerMillion;

  return Math.max(0, Math.round(cost));
}
