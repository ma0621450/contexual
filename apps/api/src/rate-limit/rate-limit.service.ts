import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import type { RateLimitRule } from './rate-limit.policies';

export type RateLimitState = { count: number; retryAfterSeconds: number };

export const RATE_LIMITED_CODE = 'RATE_LIMITED';
const SWEEP_INTERVAL_MS = 10 * 60_000;

export class RateLimitExceededException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: RATE_LIMITED_CODE,
        message: `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`,
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

type BucketRow = { count: number; resetAt: Date; now: Date };

@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private sweepTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.sweepTimer);
  }

  /** Counts one event and throws once the rule's limit is exceeded. */
  async consume(rule: RateLimitRule, subject: string): Promise<void> {
    const state = await this.hit(rule, subject);
    if (state.count > rule.limit) {
      throw new RateLimitExceededException(state.retryAfterSeconds);
    }
  }

  /** Throws when earlier events (e.g. failures) already exhausted the rule. */
  async assertAvailable(rule: RateLimitRule, subject: string): Promise<void> {
    const state = await this.peek(rule, subject);
    if (state && state.count >= rule.limit) {
      throw new RateLimitExceededException(state.retryAfterSeconds);
    }
  }

  /** True when another event would still be allowed, without throwing. */
  async isAvailable(rule: RateLimitRule, subject: string): Promise<boolean> {
    const state = await this.peek(rule, subject);
    return !state || state.count < rule.limit;
  }

  async hit(rule: RateLimitRule, subject: string): Promise<RateLimitState> {
    const key = bucketKey(rule, subject);
    const seconds = Math.ceil(rule.windowMs / 1000);
    const rows = await this.query(
      () =>
        this.prisma.$queryRaw<BucketRow[]>`
        INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
        VALUES (
          ${key},
          1,
          (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + make_interval(secs => ${seconds}::int)
        )
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE
            WHEN "RateLimitBucket"."resetAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN 1
            ELSE "RateLimitBucket"."count" + 1
          END,
          "resetAt" = CASE
            WHEN "RateLimitBucket"."resetAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN EXCLUDED."resetAt"
            ELSE "RateLimitBucket"."resetAt"
          END
        RETURNING "count", "resetAt", (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS "now"
      `,
    );
    return toState(rows[0]);
  }

  async peek(
    rule: RateLimitRule,
    subject: string,
  ): Promise<RateLimitState | null> {
    const key = bucketKey(rule, subject);
    const rows = await this.query(
      () =>
        this.prisma.$queryRaw<BucketRow[]>`
        SELECT "count", "resetAt", (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS "now"
        FROM "RateLimitBucket"
        WHERE "key" = ${key}
          AND "resetAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      `,
    );
    return rows[0] ? toState(rows[0]) : null;
  }

  async reset(rule: RateLimitRule, subject: string): Promise<void> {
    const key = bucketKey(rule, subject);
    await this.query(() =>
      this.prisma.rateLimitBucket.deleteMany({ where: { key } }),
    );
  }

  async sweep(): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM "RateLimitBucket"
      WHERE "resetAt" < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    `.catch((error: unknown) => {
      this.logger.warn(
        `Rate limit sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  /** Fails closed: an unreachable limiter must not silently disable limits. */
  private async query<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      this.logger.error(
        'Rate limit store unavailable; rejecting request',
        error instanceof Error ? error.message : String(error),
      );
      throw new ServiceUnavailableException(
        'This service is temporarily unavailable. Please try again shortly.',
      );
    }
  }
}

export function bucketKey(rule: RateLimitRule, subject: string): string {
  const digest = createHash('sha256')
    .update(subject.trim().toLowerCase())
    .digest('hex');
  return `${rule.name}:${digest}`;
}

function toState(row: BucketRow | undefined): RateLimitState {
  if (!row) return { count: 0, retryAfterSeconds: 0 };
  const remainingMs = row.resetAt.getTime() - row.now.getTime();
  return {
    count: Number(row.count),
    retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
  };
}
