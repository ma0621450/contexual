import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../common/crypto/encryption.service';
import { PrismaService } from '../database/prisma.service';
import { sealEmailContent } from './email-content';

type SendMailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('RESEND_API_KEY') &&
      this.config.get<string>('EMAIL_FROM'),
    );
  }

  async sendVerificationOtp(
    to: string,
    name: string,
    otp: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.send({
      to,
      idempotencyKey,
      subject: 'Verify your Promplex email',
      text: `Hi ${name},\n\nYour verification code is ${otp}. It expires in 15 minutes.\n`,
      html: `<p>Hi ${this.escapeHtml(name)},</p><p>Your verification code is <strong>${otp}</strong>.</p><p>It expires in 15 minutes.</p>`,
    });
  }

  async sendTeamInvite(params: {
    to: string;
    organizationName: string;
    inviterName: string;
    inviteUrl: string;
    idempotencyKey: string;
  }): Promise<void> {
    await this.send({
      to: params.to,
      idempotencyKey: params.idempotencyKey,
      subject: `Join ${params.organizationName} on Promplex`,
      text: `${params.inviterName} invited you to join ${params.organizationName} on Promplex.\n\nAccept the invite: ${params.inviteUrl}\n`,
      html: `<p>${this.escapeHtml(params.inviterName)} invited you to join <strong>${this.escapeHtml(params.organizationName)}</strong> on Promplex.</p><p><a href="${params.inviteUrl}">Accept invitation</a></p>`,
    });
  }

  async sendPasswordReset(params: {
    to: string;
    name: string;
    resetUrl: string;
    idempotencyKey: string;
  }): Promise<void> {
    await this.send({
      to: params.to,
      idempotencyKey: params.idempotencyKey,
      subject: 'Reset your Promplex password',
      text: `Hi ${params.name},\n\nReset your password: ${params.resetUrl}\n\nThis link expires in 1 hour.\n`,
      html: `<p>Hi ${this.escapeHtml(params.name)},</p><p><a href="${params.resetUrl}">Reset your password</a></p><p>This link expires in 1 hour.</p>`,
    });
  }

  private async send(params: SendMailParams): Promise<void> {
    if (!this.isConfigured()) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new Error('Email delivery is not configured');
      }
      this.logger.log(`[dev email] To: ${params.to}; ${params.subject}`);
      return;
    }

    await this.prisma.emailOutbox.upsert({
      where: { idempotencyKey: params.idempotencyKey },
      update: {},
      create: {
        idempotencyKey: params.idempotencyKey,
        to: params.to,
        subject: params.subject,
        html: sealEmailContent(this.encryption, params.html),
        text: sealEmailContent(this.encryption, params.text),
        maxAttempts: Number(this.config.get<string>('EMAIL_MAX_ATTEMPTS') || 5),
      },
    });
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }
}
