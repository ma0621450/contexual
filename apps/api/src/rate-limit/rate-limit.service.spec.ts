import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import {
  bucketKey,
  RATE_LIMITED_CODE,
  RateLimitExceededException,
  RateLimitService,
} from './rate-limit.service';
import type { RateLimitRule } from './rate-limit.policies';

const rule: RateLimitRule = { name: 'test:rule', limit: 3, windowMs: 60_000 };

function row(count: number, secondsLeft = 30) {
  const now = new Date('2026-10-19T12:00:00.000Z');
  return {
    count,
    now,
    resetAt: new Date(now.getTime() + secondsLeft * 1000),
  };
}

describe('RateLimitService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    rateLimitBucket: { deleteMany: jest.fn() },
  };
  const service = new RateLimitService(prisma as never);

  beforeEach(() => jest.resetAllMocks());

  it('allows events up to the limit and rejects the next one', async () => {
    for (const count of [1, 2, 3]) {
      prisma.$queryRaw.mockResolvedValueOnce([row(count)]);
      await expect(service.consume(rule, 'a')).resolves.toBeUndefined();
    }
    prisma.$queryRaw.mockResolvedValueOnce([row(4, 42)]);

    const error = await service.consume(rule, 'a').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitExceededException);
    const exception = error as RateLimitExceededException;
    expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(exception.retryAfterSeconds).toBe(42);
    expect(exception.getResponse()).toEqual({
      statusCode: 429,
      code: RATE_LIMITED_CODE,
      message: 'Too many attempts. Please wait 1 minute and try again.',
      retryAfterSeconds: 42,
    });
  });

  it('only blocks on peek once failures have reached the limit', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.assertAvailable(rule, 'a')).resolves.toBeUndefined();

    prisma.$queryRaw.mockResolvedValueOnce([row(2)]);
    await expect(service.assertAvailable(rule, 'a')).resolves.toBeUndefined();

    prisma.$queryRaw.mockResolvedValueOnce([row(3, 600)]);
    await expect(service.assertAvailable(rule, 'a')).rejects.toMatchObject({
      retryAfterSeconds: 600,
    });
  });

  it('fails closed when the store is unavailable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('relation does not exist'));

    await expect(service.consume(rule, 'a')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.assertAvailable(rule, 'a')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('stores only hashed, normalized subjects', () => {
    const key = bucketKey(rule, '  Person@Example.com ');
    expect(key).toBe(bucketKey(rule, 'person@example.com'));
    expect(key).toMatch(/^test:rule:[0-9a-f]{64}$/);
    expect(key).not.toContain('person');
  });
});
