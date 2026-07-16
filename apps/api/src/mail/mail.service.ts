import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SendMailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

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
  ): Promise<void> {
    await this.send({
      to,
      subject: 'Verify your Contexual email',
      text: `Hi ${name},\n\nYour verification code is ${otp}. It expires in 15 minutes.\n`,
      html: `<p>Hi ${this.escapeHtml(name)},</p><p>Your verification code is <strong>${otp}</strong>.</p><p>It expires in 15 minutes.</p>`,
    });
  }

  async sendTeamInvite(params: {
    to: string;
    organizationName: string;
    inviterName: string;
    inviteUrl: string;
  }): Promise<void> {
    await this.send({
      to: params.to,
      subject: `Join ${params.organizationName} on Contexual`,
      text: `${params.inviterName} invited you to join ${params.organizationName} on Contexual.\n\nAccept the invite: ${params.inviteUrl}\n`,
      html: `<p>${this.escapeHtml(params.inviterName)} invited you to join <strong>${this.escapeHtml(params.organizationName)}</strong> on Contexual.</p><p><a href="${params.inviteUrl}">Accept invitation</a></p>`,
    });
  }

  async sendPasswordReset(params: {
    to: string;
    name: string;
    resetUrl: string;
  }): Promise<void> {
    await this.send({
      to: params.to,
      subject: 'Reset your Contexual password',
      text: `Hi ${params.name},\n\nReset your password: ${params.resetUrl}\n\nThis link expires in 1 hour.\n`,
      html: `<p>Hi ${this.escapeHtml(params.name)},</p><p><a href="${params.resetUrl}">Reset your password</a></p><p>This link expires in 1 hour.</p>`,
    });
  }

  private async send(params: SendMailParams): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.log(
        `[dev email] To: ${params.to}\nSubject: ${params.subject}\n${params.text}`,
      );
      return;
    }

    const apiKey = this.config.getOrThrow<string>('RESEND_API_KEY');
    const from = this.config.getOrThrow<string>('EMAIL_FROM');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        `Failed to send email to ${params.to} (${response.status}): ${body}`,
      );
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }
}
