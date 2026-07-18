import { AiProvider } from '@contexual/database';
import { ProvidersService } from './providers.service';

describe('ProvidersService model catalog', () => {
  it('returns only the public catalog contract with one default per provider', () => {
    const service = new ProvidersService(
      null as never,
      null as never,
      null as never,
    );
    const models = service.getAvailableModels();

    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(Object.keys(model).sort()).toEqual(
        ['contextWindow', 'id', 'isDefault', 'label', 'provider'].sort(),
      );
      expect(model.contextWindow).toBeGreaterThan(0);
    }

    for (const provider of Object.values(AiProvider)) {
      expect(
        models.filter(
          (model) => model.provider === provider && model.isDefault,
        ),
      ).toHaveLength(1);
    }
  });
});
