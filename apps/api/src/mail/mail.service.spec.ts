import { MailService } from './mail.service';

describe('MailService outbox', () => {
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        NODE_ENV: 'production',
        RESEND_API_KEY: 're_test',
        EMAIL_FROM: 'Contexual <mail@example.com>',
        EMAIL_MAX_ATTEMPTS: '4',
      };
      return values[key];
    }),
  };
  const prisma = {
    emailOutbox: {
      upsert: jest.fn().mockResolvedValue({ id: 'email-1' }),
    },
  };
  const service = new MailService(config as never, prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('durably enqueues verification mail with caller idempotency', async () => {
    await service.sendVerificationOtp(
      'person@example.com',
      'Person',
      '1234',
      'verification:user-1:otp-hash',
    );

    expect(prisma.emailOutbox.upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: 'verification:user-1:otp-hash' },
      update: {},
      create: {
        idempotencyKey: 'verification:user-1:otp-hash',
        to: 'person@example.com',
        subject: 'Verify your Contexual email',
        text: 'Hi Person,\n\nYour verification code is 1234. It expires in 15 minutes.\n',
        html: '<p>Hi Person,</p><p>Your verification code is <strong>1234</strong>.</p><p>It expires in 15 minutes.</p>',
        maxAttempts: 4,
      },
    });
  });
});
