import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService, REQUIRED_SCHEMA } from './health.service';

describe('HealthService', () => {
  const prisma = { $queryRaw: jest.fn() };
  const clamAv = { checkReady: jest.fn() };
  const storage = { checkReady: jest.fn() };
  const service = new HealthService(
    prisma as never,
    clamAv as never,
    storage as never,
  );

  function mockDatabase(
    columns: ReadonlyArray<readonly [string, string]> = REQUIRED_SCHEMA,
  ) {
    prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray) =>
      Promise.resolve(
        strings.join('').includes('information_schema')
          ? columns.map(([table_name, column_name]) => ({
              table_name,
              column_name,
            }))
          : [{ '?column?': 1 }],
      ),
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
    mockDatabase();
    clamAv.checkReady.mockResolvedValue(undefined);
    storage.checkReady.mockResolvedValue(undefined);
  });

  it('reports ready when required dependencies are healthy', async () => {
    await expect(service.ready()).resolves.toEqual({
      status: 'ready',
      dependencies: {
        postgres: 'ok',
        schema: 'ok',
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
          schema: 'unavailable',
          clamav: 'unavailable',
          storage: 'ok',
        },
      },
    } satisfies Partial<ServiceUnavailableException>);
  });

  it('stays unready until pending migrations have been applied', async () => {
    mockDatabase(
      REQUIRED_SCHEMA.filter(([table]) => table !== 'RateLimitBucket'),
    );

    await expect(service.ready()).rejects.toMatchObject({
      response: {
        status: 'unready',
        dependencies: { postgres: 'ok', schema: 'unavailable' },
      },
    });
  });
});
