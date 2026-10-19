import { EncryptionService } from '../common/crypto/encryption.service';
import { openEmailContent } from './email-content';
import { MailService } from './mail.service';

type OutboxCreate = {
  create: { html: string; text: string; idempotencyKey: string };
};

function testEncryption() {
  const encryption = new EncryptionService({
    getOrThrow: () => 'ab'.repeat(32),
  } as never);
  encryption.onModuleInit();
  return encryption;
}

describe('MailService outbox', () => {
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        NODE_ENV: 'production',
        RESEND_API_KEY: 're_test',
        EMAIL_FROM: 'Promplex <mail@example.com>',
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
  const encryption = testEncryption();
  const service = new MailService(config as never, prisma as never, encryption);

  function lastCreate(): OutboxCreate['create'] {
    const [input] = prisma.emailOutbox.upsert.mock.calls.at(-1) as [
      OutboxCreate,
    ];
    return input.create;
  }

  beforeEach(() => jest.clearAllMocks());

  it('durably enqueues verification mail with caller idempotency', async () => {
    await service.sendVerificationOtp(
      'person@example.com',
      'Person',
      '1234',
      'verification:user-1:random',
    );

    expect(prisma.emailOutbox.upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: 'verification:user-1:random' },
      update: {},
      create: expect.objectContaining({
        idempotencyKey: 'verification:user-1:random',
        to: 'person@example.com',
        subject: 'Verify your Promplex email',
        maxAttempts: 4,
      }) as unknown,
    });
    const create = lastCreate();
    expect(openEmailContent(encryption, create.text)).toBe(
      'Hi Person,\n\nYour verification code is 1234. It expires in 15 minutes.\n',
    );
    expect(openEmailContent(encryption, create.html)).toBe(
      '<p>Hi Person,</p><p>Your verification code is <strong>1234</strong>.</p><p>It expires in 15 minutes.</p>',
    );
  });

  it('never stores invite proofs or reset tokens in plaintext', async () => {
    const inviteUrl =
      'https://app.example.com/onboarding?invite=tok#proof=proof-abc123';
    await service.sendTeamInvite({
      to: 'invitee@example.com',
      organizationName: 'Workspace',
      inviterName: 'Admin',
      inviteUrl,
      idempotencyKey: 'invite:1',
    });
    const invite = lastCreate();

    const resetUrl =
      'https://app.example.com/reset-password?token=reset-xyz789';
    await service.sendPasswordReset({
      to: 'person@example.com',
      name: 'Person',
      resetUrl,
      idempotencyKey: 'reset:1',
    });
    const reset = lastCreate();

    for (const stored of [invite.html, invite.text, reset.html, reset.text]) {
      expect(stored).toMatch(/^enc:v1:/);
      expect(stored).not.toContain('proof-abc123');
      expect(stored).not.toContain('reset-xyz789');
    }
    expect(openEmailContent(encryption, invite.text)).toContain(inviteUrl);
    expect(openEmailContent(encryption, reset.text)).toContain(resetUrl);
  });
});
