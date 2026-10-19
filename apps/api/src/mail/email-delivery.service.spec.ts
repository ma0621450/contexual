import {
  EmailDeliveryService,
  MailDeliveryError,
} from './email-delivery.service';

describe('EmailDeliveryService', () => {
  const config = {
    get: jest.fn((key: string) => (key === 'EMAIL_TIMEOUT_MS' ? '1000' : null)),
    getOrThrow: jest.fn((key: string) =>
      key === 'RESEND_API_KEY' ? 're_test' : 'PromplexAI <mail@example.com>',
    ),
  };
  const service = new EmailDeliveryService(config as never);
  const email = {
    idempotencyKey: 'verification:user:hash',
    to: 'person@example.com',
    subject: 'Verify',
    html: '<p>code</p>',
    text: 'code',
  };

  afterEach(() => jest.restoreAllMocks());

  it('returns the provider id and supplies an idempotency key', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(service.deliver(email)).resolves.toBe('email-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(
      new Headers(fetchMock.mock.calls[0][1]?.headers).get('Idempotency-Key'),
    ).toBe(email.idempotencyKey);
  });

  it.each([
    [429, true],
    [503, true],
    [400, false],
  ])('normalizes status %s with retryable=%s', async (status, retryable) => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('provider details', { status }));

    await expect(service.deliver(email)).rejects.toEqual(
      new MailDeliveryError(
        `Email provider rejected the request (${status})`,
        retryable,
      ),
    );
  });
});
