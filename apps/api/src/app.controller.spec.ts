import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { HealthService } from './health/health.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            live: () => ({ status: 'ok' }),
            ready: () => Promise.resolve({ status: 'ready' }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('returns health status', () => {
    expect(appController.health()).toEqual({ status: 'ok' });
  });

  it('returns liveness status', () => {
    expect(appController.live()).toEqual({ status: 'ok' });
  });
});
