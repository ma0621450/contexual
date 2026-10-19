import { EmailOutboxStatus } from '@contexual/database';
import { EncryptionService } from '../common/crypto/encryption.service';
import { REDACTED_EMAIL_CONTENT, sealEmailContent } from './email-content';
import { EmailOutboxProcessorService } from './email-outbox-processor.service';
import { MailDeliveryError } from './email-delivery.service';

type OutboxUpdate = {
  where: { id: string; lockedBy: string };
  data: {
    status: EmailOutboxStatus;
    providerId?: string;
    lastError: string | null;
    html?: string;
    text?: string;
    contentRedactedAt?: Date;
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
  const encryption = new EncryptionService({
    getOrThrow: () => 'cd'.repeat(32),
  } as never);
  encryption.onModuleInit();
  const processor = new EmailOutboxProcessorService(
    prisma as never,
    delivery as never,
    config as never,
    encryption,
  );
  const plaintext = {
    html: '<p>Join: https://app.example.com/onboarding?invite=t#proof=p</p>',
    text: 'Join: https://app.example.com/onboarding?invite=t#proof=p',
  };
  const email = {
    id: 'email-1',
    idempotencyKey: 'verification:user-1:random',
    to: 'person@example.com',
    subject: 'Verify',
    html: sealEmailContent(encryption, plaintext.html),
    text: sealEmailContent(encryption, plaintext.text),
    attempts: 1,
    maxAttempts: 4,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    updates.length = 0;
    jest.spyOn(processor, 'claimNext').mockResolvedValue(email);
  });

  afterEach(() => jest.restoreAllMocks());

  it('delivers decrypted content and redacts it once sent', async () => {
    delivery.deliver.mockResolvedValue('provider-1');

    await expect(processor.processNext()).resolves.toBe(true);

    expect(delivery.deliver).toHaveBeenCalledWith({ ...email, ...plaintext });
    const update = updates[0];
    if (!update) throw new Error('Expected a sent outbox update');
    expect(update.where.id).toBe(email.id);
    expect(update.where.lockedBy).toMatch(/^email-/);
    expect(update.data).toMatchObject({
      status: EmailOutboxStatus.SENT,
      providerId: 'provider-1',
      lastError: null,
      html: REDACTED_EMAIL_CONTENT,
      text: REDACTED_EMAIL_CONTENT,
    });
    expect(update.data.contentRedactedAt).toBeInstanceOf(Date);
  });

  it('still delivers rows queued as plaintext before encryption shipped', async () => {
    jest
      .spyOn(processor, 'claimNext')
      .mockResolvedValue({ ...email, ...plaintext });
    delivery.deliver.mockResolvedValue('provider-1');

    await processor.processNext();

    expect(delivery.deliver).toHaveBeenCalledWith({ ...email, ...plaintext });
  });

  it('keeps content for retries but redacts permanently failed mail', async () => {
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
    expect(retryUpdate.data).not.toHaveProperty('html');
    expect(retryUpdate.data).not.toHaveProperty('contentRedactedAt');

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
      html: REDACTED_EMAIL_CONTENT,
      text: REDACTED_EMAIL_CONTENT,
    });
  });

  it('fails without retry or leaking details when content cannot be decrypted', async () => {
    jest
      .spyOn(processor, 'claimNext')
      .mockResolvedValue({ ...email, html: 'enc:v1:bad:data.tag' });

    await processor.processNext();

    expect(delivery.deliver).not.toHaveBeenCalled();
    expect(updates[0]?.data).toMatchObject({
      status: EmailOutboxStatus.FAILED,
      lastError: 'Email content could not be decrypted',
      html: REDACTED_EMAIL_CONTENT,
    });
  });

  it('redacts finished rows left over from before redaction shipped', async () => {
    prisma.emailOutbox.updateMany.mockResolvedValueOnce({ count: 3 });

    await expect(processor.redactFinishedEmails()).resolves.toBe(3);

    expect(prisma.emailOutbox.updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: [EmailOutboxStatus.SENT, EmailOutboxStatus.FAILED] },
        contentRedactedAt: null,
      },
      data: expect.objectContaining({
        html: REDACTED_EMAIL_CONTENT,
        text: REDACTED_EMAIL_CONTENT,
      }) as unknown,
    });
  });
});
