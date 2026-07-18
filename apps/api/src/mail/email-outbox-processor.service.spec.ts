import { EmailOutboxStatus } from '@contexual/database';
import { EmailOutboxProcessorService } from './email-outbox-processor.service';
import { MailDeliveryError } from './email-delivery.service';

type OutboxUpdate = {
  where: { id: string; lockedBy: string };
  data: {
    status: EmailOutboxStatus;
    providerId?: string;
    lastError: string | null;
  };
};

describe('EmailOutboxProcessorService', () => {
  const updates: OutboxUpdate[] = [];
  const prisma = {
    emailOutbox: {
      updateMany: jest.fn((input: OutboxUpdate) => {
        updates.push(input);
        return Promise.resolve({ count: 1 });
      }),
    },
  };
  const delivery = { deliver: jest.fn() };
  const config = { get: jest.fn() };
  const processor = new EmailOutboxProcessorService(
    prisma as never,
    delivery as never,
    config as never,
  );
  const email = {
    id: 'email-1',
    idempotencyKey: 'verification:user-1:hash',
    to: 'person@example.com',
    subject: 'Verify',
    html: '<p>Verify</p>',
    text: 'Verify',
    attempts: 1,
    maxAttempts: 4,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    updates.length = 0;
    jest.spyOn(processor, 'claimNext').mockResolvedValue(email);
  });

  afterEach(() => jest.restoreAllMocks());

  it('marks successful delivery sent without changing idempotency', async () => {
    delivery.deliver.mockResolvedValue('provider-1');

    await expect(processor.processNext()).resolves.toBe(true);

    expect(delivery.deliver).toHaveBeenCalledWith(email);
    const update = updates[0];
    if (!update) throw new Error('Expected a sent outbox update');
    expect(update.where.id).toBe(email.id);
    expect(update.where.lockedBy).toMatch(/^email-/);
    expect(update.data).toMatchObject({
      status: EmailOutboxStatus.SENT,
      providerId: 'provider-1',
      lastError: null,
    });
  });

  it('schedules retryable failures but permanently fails exhausted mail', async () => {
    delivery.deliver.mockRejectedValue(
      new MailDeliveryError('Provider unavailable', true),
    );

    await processor.processNext();
    const retryUpdate = updates[0];
    if (!retryUpdate) throw new Error('Expected a retry outbox update');
    expect(retryUpdate.data).toMatchObject({
      status: EmailOutboxStatus.RETRY,
      lastError: 'Provider unavailable',
    });

    jest.spyOn(processor, 'claimNext').mockResolvedValue({
      ...email,
      attempts: email.maxAttempts,
    });
    await processor.processNext();
    const failedUpdate = updates[1];
    if (!failedUpdate) throw new Error('Expected a failed outbox update');
    expect(failedUpdate.data).toMatchObject({
      status: EmailOutboxStatus.FAILED,
      lastError: 'Provider unavailable',
    });
  });
});
