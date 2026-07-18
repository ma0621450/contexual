import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const prisma = { $queryRaw: jest.fn() };
  const clamAv = { checkReady: jest.fn() };
  const storage = { checkReady: jest.fn() };
  const service = new HealthService(
    prisma as never,
    clamAv as never,
    storage as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    clamAv.checkReady.mockResolvedValue(undefined);
    storage.checkReady.mockResolvedValue(undefined);
  });

  it('reports ready when required dependencies are healthy', async () => {
    await expect(service.ready()).resolves.toEqual({
      status: 'ready',
      dependencies: {
        postgres: 'ok',
        clamav: 'ok',
        storage: 'ok',
      },
    });
  });

  it('reports sanitized dependency failures as unready', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('password=secret'));
    clamAv.checkReady.mockRejectedValue(new Error('socket details'));

    await expect(service.ready()).rejects.toMatchObject({
      response: {
        status: 'unready',
        dependencies: {
          postgres: 'unavailable',
          clamav: 'unavailable',
          storage: 'ok',
        },
      },
    } satisfies Partial<ServiceUnavailableException>);
  });
});
