import { AiProvider } from '@contexual/database';
import { AiProviderClient } from './ai-provider.client';
import type { OpenAiClient, OpenAiStreamPart } from './openai.client';

function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

async function collect(
  stream: AsyncGenerator<OpenAiStreamPart>,
): Promise<OpenAiStreamPart[]> {
  const parts: OpenAiStreamPart[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
}

describe('AiProviderClient provider streams', () => {
  const client = new AiProviderClient({} as OpenAiClient);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('streams Anthropic text and usage events', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        {
          type: 'message_start',
          message: { usage: { input_tokens: 7 } },
        },
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello' },
        },
        { type: 'message_delta', usage: { output_tokens: 3 } },
      ]),
    );

    const parts = await collect(
      client.streamChatCompletion(
        AiProvider.ANTHROPIC,
        'key',
        'claude-sonnet-5',
        [{ role: 'user', content: 'Hi' }],
      ),
    );

    expect(parts).toEqual([
      { kind: 'delta', content: 'Hello' },
      { kind: 'usage', promptTokens: 7, completionTokens: 3 },
    ]);
    const request = fetchMock.mock.calls[0]?.[1];
    const requestBody = request?.body;
    if (typeof requestBody !== 'string') {
      throw new Error('Expected a JSON request body');
    }
    expect(JSON.parse(requestBody)).toMatchObject({ stream: true });
  });

  it('streams Gemini text and final usage metadata', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        { candidates: [{ content: { parts: [{ text: 'Gem' }] } }] },
        {
          candidates: [{ content: { parts: [{ text: 'ini' }] } }],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 2,
          },
        },
      ]),
    );

    const parts = await collect(
      client.streamChatCompletion(
        AiProvider.GOOGLE,
        'google-key',
        'gemini-3.6-flash',
        [{ role: 'user', content: 'Hi' }],
      ),
    );

    expect(parts).toEqual([
      { kind: 'delta', content: 'Gem' },
      { kind: 'delta', content: 'ini' },
      { kind: 'usage', promptTokens: 5, completionTokens: 2 },
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      ':streamGenerateContent?alt=sse',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-goog-api-key': 'google-key',
    });
  });

  it('surfaces provider error events', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        sseResponse([{ type: 'error', error: { message: 'overloaded' } }]),
      );

    await expect(
      collect(
        client.streamChatCompletion(
          AiProvider.ANTHROPIC,
          'key',
          'claude-sonnet-5',
          [{ role: 'user', content: 'Hi' }],
        ),
      ),
    ).rejects.toThrow('overloaded');
  });
});
