import { estimateCostCents, SUPPORTED_OPENAI_MODELS } from './pricing';
import { AiProvider } from '@contexual/database';
import { getModelsForProvider } from './model-catalog';

describe('chat pricing', () => {
  it('lists the models exposed by the chat picker', () => {
    expect(SUPPORTED_OPENAI_MODELS).toEqual([
      'gpt-5.6-luna',
      'gpt-5.6-terra',
      'gpt-5.6-sol',
    ]);
  });

  it.each(Object.values(AiProvider))(
    'has models and pricing for %s',
    (provider) => {
      const models = getModelsForProvider(provider);
      expect(models.length).toBeGreaterThan(0);
      for (const model of models) {
        expect(
          estimateCostCents(model.id, 1_000, 1_000),
        ).toBeGreaterThanOrEqual(0);
      }
    },
  );

  it.each([
    ['gpt-5.6-luna', 1_000_000, 0, 20],
    ['gpt-5.6-luna', 0, 1_000_000, 120],
    ['gpt-5.6-terra', 1_000_000, 1_000_000, 1400],
    ['claude-sonnet-5', 1_000_000, 1_000_000, 1800],
  ])(
    'calculates %s usage',
    (model, promptTokens, completionTokens, expected) => {
      expect(estimateCostCents(model, promptTokens, completionTokens)).toBe(
        expected,
      );
    },
  );
});
