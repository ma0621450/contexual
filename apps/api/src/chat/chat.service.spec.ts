import { AiProvider, MessageRole, PlanTier } from '@contexual/database';
import { ChatService } from './chat.service';

async function collect<T>(stream: AsyncGenerator<T>): Promise<T[]> {
  const events: T[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe('ChatService streaming lifecycle', () => {
  const membership = {
    id: 'membership-1',
    suspended: false,
    spendLimitCents: null,
    spendUsedCents: 0,
    tokenLimit: null,
    tokensUsed: 0,
    spendPeriodStartedAt: new Date(),
  };
  const organization = {
    id: 'org-1',
    planTier: PlanTier.FREE,
    monthlySpendLimitCents: null,
    monthlySpendUsedCents: 0,
    monthlyTokenLimit: null,
    monthlyTokensUsed: 0,
    usagePeriodStartedAt: new Date(),
  };
  const assistant = {
    id: 'assistant-1',
    role: MessageRole.ASSISTANT,
    content: 'Hello',
    createdAt: new Date(),
  };
  const tx = {
    $executeRaw: jest.fn(),
    message: {
      create: jest
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(assistant),
    },
    usageLog: { create: jest.fn() },
    membership: { update: jest.fn() },
    organization: { update: jest.fn() },
    usageReservation: { update: jest.fn() },
    conversation: { update: jest.fn() },
  };
  const prisma = {
    membership: {
      findUnique: jest.fn().mockResolvedValue(membership),
      updateMany: jest.fn(),
    },
    organization: {
      findUnique: jest.fn().mockResolvedValue(organization),
      updateMany: jest.fn(),
    },
    conversation: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'conversation-1', title: 'Hello' }),
    },
    message: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((operation: (value: typeof tx) => unknown) =>
      operation(tx),
    ),
  };
  const providers = {
    getDecryptedKey: jest.fn().mockResolvedValue({
      provider: AiProvider.OPENAI,
      apiKey: 'test-key',
      defaultModel: 'gpt-4o-mini',
    }),
  };
  const aiProvider = { streamChatCompletion: jest.fn() };
  const audit = { record: jest.fn() };
  const memories = { getPromptMemories: jest.fn().mockResolvedValue([]) };
  const files = { getAttachments: jest.fn().mockResolvedValue([]) };
  const reservations = {
    reserve: jest.fn().mockResolvedValue({ id: 'reservation-1' }),
    release: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const service = new ChatService(
    prisma as never,
    providers as never,
    aiProvider as never,
    audit as never,
    memories as never,
    files as never,
    reservations as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.membership.findUnique.mockResolvedValue(membership);
    prisma.organization.findUnique.mockResolvedValue(organization);
    prisma.conversation.create.mockResolvedValue({
      id: 'conversation-1',
      title: 'Hello',
    });
    prisma.message.findMany.mockResolvedValue([]);
    files.getAttachments.mockResolvedValue([]);
    reservations.reserve.mockResolvedValue({ id: 'reservation-1' });
    tx.message.create
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(assistant);
  });

  it('releases a pending reservation when an upstream stream aborts', async () => {
    aiProvider.streamChatCompletion.mockImplementation(async function* () {
      await Promise.resolve();
      if (Date.now() < 0) {
        yield { kind: 'delta', content: '' };
      }
      throw new DOMException('The operation was aborted', 'AbortError');
    });

    await expect(
      collect(
        service.streamMessage(
          'org-1',
          'user-1',
          { content: 'Hello' },
          new AbortController().signal,
        ),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(reservations.release).toHaveBeenCalledWith('reservation-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('emits one done event and completes the reservation on success', async () => {
    aiProvider.streamChatCompletion.mockImplementation(async function* () {
      await Promise.resolve();
      yield { kind: 'delta', content: 'Hello' };
      yield { kind: 'usage', promptTokens: 4, completionTokens: 2 };
    });

    const events = await collect(
      service.streamMessage('org-1', 'user-1', { content: 'Hello' }),
    );

    expect(events.map((event) => event.type)).toEqual([
      'start',
      'token',
      'done',
    ]);
    expect(reservations.release).not.toHaveBeenCalled();
    expect(tx.usageReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'reservation-1' } }),
    );
  });

  it('keeps prior message attachments in context for follow-up prompts', async () => {
    prisma.message.findMany.mockResolvedValue([
      {
        role: MessageRole.USER,
        content: 'Review this document',
        attachments: [
          {
            file: {
              id: 'file-1',
              filename: 'strategy.pdf',
              extractedText: 'The launch date is October 12.',
            },
          },
        ],
      },
      {
        role: MessageRole.ASSISTANT,
        content: 'I reviewed the document.',
        attachments: [],
      },
    ]);
    aiProvider.streamChatCompletion.mockImplementation(async function* () {
      await Promise.resolve();
      yield { kind: 'delta', content: 'October 12' };
      yield { kind: 'usage', promptTokens: 10, completionTokens: 2 };
    });

    await collect(
      service.streamMessage('org-1', 'user-1', {
        content: 'What is the launch date?',
      }),
    );

    expect(aiProvider.streamChatCompletion).toHaveBeenCalledWith(
      AiProvider.OPENAI,
      'test-key',
      'gpt-4o-mini',
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining(
            '<attachment filename="strategy.pdf">',
          ),
        }),
      ]),
      undefined,
    );
  });
});
