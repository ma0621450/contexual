import { estimateCostCents, SUPPORTED_OPENAI_MODELS } from './pricing';
import { AiProvider } from '@contexual/database';
import { getModelsForProvider } from './model-catalog';

describe('chat pricing', () => {
  it('lists the models exposed by the chat picker', () => {
    expect(SUPPORTED_OPENAI_MODELS).toEqual([
      'gpt-4o-mini',
      'gpt-4o',
      'gpt-4.1',
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
    ['gpt-4o-mini', 1_000_000, 0, 15],
    ['gpt-4o-mini', 0, 1_000_000, 60],
    ['gpt-4o', 1_000_000, 1_000_000, 1250],
    ['gpt-4.1', 1_000_000, 1_000_000, 1000],
  ])(
    'calculates %s usage',
    (model, promptTokens, completionTokens, expected) => {
      expect(estimateCostCents(model, promptTokens, completionTokens)).toBe(
        expected,
      );
    },
  );
});
