import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ClamAvService } from '../files/clamav.service';
import { StorageService } from '../files/storage.service';

type DependencyName = 'postgres' | 'clamav' | 'storage';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clamAv: ClamAvService,
    private readonly storage: StorageService,
  ) {}

  live() {
    return { status: 'ok' as const };
  }

  async ready() {
    const checks: Array<[DependencyName, () => Promise<unknown>]> = [
      ['postgres', () => this.prisma.$queryRaw`SELECT 1`],
      ['clamav', () => this.clamAv.checkReady()],
      ['storage', () => this.storage.checkReady()],
    ];
    const results = await Promise.allSettled(
      checks.map(([, check]) => check()),
    );
    const dependencies = Object.fromEntries(
      checks.map(([name], index) => [
        name,
        results[index].status === 'fulfilled' ? 'ok' : 'unavailable',
      ]),
    );

    if (results.some((result) => result.status === 'rejected')) {
      throw new ServiceUnavailableException({
        status: 'unready',
        dependencies,
      });
    }
    return { status: 'ready' as const, dependencies };
  }
}
