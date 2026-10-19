import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ClamAvService } from '../files/clamav.service';
import { StorageService } from '../files/storage.service';

type DependencyName = 'postgres' | 'schema' | 'clamav' | 'storage';

/**
 * Columns introduced by the most recent migrations. Readiness stays red until
 * `prisma migrate deploy` has run, so traffic never reaches code whose
 * tables are missing. Extend when a release depends on new schema.
 */
export const REQUIRED_SCHEMA: ReadonlyArray<[table: string, column: string]> = [
  ['Invite', 'emailProofHash'],
  ['EmailOutbox', 'contentRedactedAt'],
  ['RateLimitBucket', 'resetAt'],
];

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
      ['schema', () => this.checkSchema()],
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

  private async checkSchema() {
    const tables = [...new Set(REQUIRED_SCHEMA.map(([table]) => table))];
    const rows = await this.prisma.$queryRaw<
      Array<{ table_name: string; column_name: string }>
    >`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY(${tables})
    `;
    const present = new Set(
      rows.map((row) => `${row.table_name}.${row.column_name}`),
    );
    const missing = REQUIRED_SCHEMA.filter(
      ([table, column]) => !present.has(`${table}.${column}`),
    );
    if (missing.length > 0) throw new Error('Database schema is out of date');
  }
}
