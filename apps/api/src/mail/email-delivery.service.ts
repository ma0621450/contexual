import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type DeliverableEmail = {
  idempotencyKey: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export class MailDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'MailDeliveryError';
  }
}

@Injectable()
export class EmailDeliveryService {
  constructor(private readonly config: ConfigService) {}

  async deliver(email: DeliverableEmail): Promise<string | null> {
    const timeoutMs = Number(
      this.config.get<string>('EMAIL_TIMEOUT_MS') || 10_000,
    );
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow<string>('RESEND_API_KEY')}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': email.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.config.getOrThrow<string>('EMAIL_FROM'),
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new MailDeliveryError(
        'Email provider network request failed',
        true,
      );
    }

    if (!response.ok) {
      const retryable =
        response.status === 408 ||
        response.status === 429 ||
        [500, 502, 503, 504].includes(response.status);
      throw new MailDeliveryError(
        `Email provider rejected the request (${response.status})`,
        retryable,
      );
    }

    const result = (await response.json().catch(() => null)) as {
      id?: unknown;
    } | null;
    return typeof result?.id === 'string' ? result.id : null;
  }
}
