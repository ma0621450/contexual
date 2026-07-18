import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiProvider } from '@contexual/database';
import {
  type ChatCompletionMessage,
  type ChatCompletionResult,
  OpenAiClient,
  type OpenAiStreamPart,
} from './openai.client';
import { parseSseStream } from './sse-parser';

const PROVIDER_TIMEOUT_MS = 120_000;

type AnthropicResponse = {
  content?: { type?: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
};

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { message?: string };
};

type AnthropicStreamEvent = {
  type?: string;
  message?: { usage?: { input_tokens?: number } };
  delta?: { type?: string; text?: string };
  usage?: { output_tokens?: number };
  error?: { message?: string };
};

@Injectable()
export class AiProviderClient {
  constructor(private readonly openAiClient: OpenAiClient) {}

  createChatCompletion(
    provider: AiProvider,
    apiKey: string,
    model: string,
    messages: ChatCompletionMessage[],
  ): Promise<ChatCompletionResult> {
    switch (provider) {
      case AiProvider.ANTHROPIC:
        return this.createAnthropicCompletion(apiKey, model, messages);
      case AiProvider.GOOGLE:
        return this.createGeminiCompletion(apiKey, model, messages);
      case AiProvider.XAI:
        return this.openAiClient.createChatCompletion(
          apiKey,
          model,
          messages,
          'https://api.x.ai/v1',
        );
      default:
        return this.openAiClient.createChatCompletion(apiKey, model, messages);
    }
  }

  async *streamChatCompletion(
    provider: AiProvider,
    apiKey: string,
    model: string,
    messages: ChatCompletionMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<OpenAiStreamPart> {
    if (provider === AiProvider.OPENAI || provider === AiProvider.XAI) {
      const baseUrl =
        provider === AiProvider.XAI ? 'https://api.x.ai/v1' : undefined;
      yield* this.openAiClient.streamChatCompletion(
        apiKey,
        model,
        messages,
        baseUrl,
        signal,
      );
      return;
    }

    if (provider === AiProvider.ANTHROPIC) {
      yield* this.streamAnthropicCompletion(apiKey, model, messages, signal);
      return;
    }

    yield* this.streamGeminiCompletion(apiKey, model, messages, signal);
  }

  private async *streamAnthropicCompletion(
    apiKey: string,
    model: string,
    messages: ChatCompletionMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<OpenAiStreamPart> {
    const response = await this.safeFetch(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          ...this.anthropicRequestBody(model, messages),
          stream: true,
        }),
      },
      signal,
    );
    if (!response.ok) {
      const body = (await response
        .json()
        .catch(() => ({}))) as AnthropicResponse;
      this.assertProviderResponse(response, body.error?.message);
    }
    if (!response.body) {
      throw new BadGatewayException('AI provider returned an empty stream');
    }

    let promptTokens = 0;
    let completionTokens = 0;
    for await (const event of parseSseStream(response.body)) {
      let payload: AnthropicStreamEvent;
      try {
        payload = JSON.parse(event.data) as AnthropicStreamEvent;
      } catch {
        continue;
      }

      const type = payload.type ?? event.event;
      if (type === 'error') {
        throw new BadGatewayException(
          payload.error?.message ?? 'AI provider stream failed',
        );
      }
      if (type === 'message_start') {
        promptTokens = payload.message?.usage?.input_tokens ?? promptTokens;
      } else if (
        type === 'content_block_delta' &&
        payload.delta?.type === 'text_delta' &&
        payload.delta.text
      ) {
        yield { kind: 'delta', content: payload.delta.text };
      } else if (type === 'message_delta') {
        completionTokens = payload.usage?.output_tokens ?? completionTokens;
        yield { kind: 'usage', promptTokens, completionTokens };
      }
    }
  }

  private async *streamGeminiCompletion(
    apiKey: string,
    model: string,
    messages: ChatCompletionMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<OpenAiStreamPart> {
    const response = await this.safeFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(this.geminiRequestBody(messages)),
      },
      signal,
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as GeminiResponse;
      this.assertProviderResponse(response, body.error?.message);
    }
    if (!response.body) {
      throw new BadGatewayException('AI provider returned an empty stream');
    }

    for await (const event of parseSseStream(response.body)) {
      let payload: GeminiResponse;
      try {
        payload = JSON.parse(event.data) as GeminiResponse;
      } catch {
        continue;
      }
      if (payload.error?.message || event.event === 'error') {
        throw new BadGatewayException(
          payload.error?.message ?? 'AI provider stream failed',
        );
      }

      const text = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('');
      if (text) yield { kind: 'delta', content: text };

      if (payload.usageMetadata) {
        yield {
          kind: 'usage',
          promptTokens: payload.usageMetadata.promptTokenCount ?? 0,
          completionTokens: payload.usageMetadata.candidatesTokenCount ?? 0,
        };
      }
    }
  }

  private async createAnthropicCompletion(
    apiKey: string,
    model: string,
    messages: ChatCompletionMessage[],
  ): Promise<ChatCompletionResult> {
    const response = await this.safeFetch(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(this.anthropicRequestBody(model, messages)),
      },
    );
    const body = (await response.json().catch(() => ({}))) as AnthropicResponse;
    this.assertProviderResponse(response, body.error?.message);
    const content = body.content
      ?.filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('');
    if (!content) {
      throw new BadGatewayException('AI provider returned an empty response');
    }
    return {
      content,
      promptTokens: body.usage?.input_tokens ?? 0,
      completionTokens: body.usage?.output_tokens ?? 0,
    };
  }

  private async createGeminiCompletion(
    apiKey: string,
    model: string,
    messages: ChatCompletionMessage[],
  ): Promise<ChatCompletionResult> {
    const response = await this.safeFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(this.geminiRequestBody(messages)),
      },
    );
    const body = (await response.json().catch(() => ({}))) as GeminiResponse;
    this.assertProviderResponse(response, body.error?.message);
    const content = body.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('');
    if (!content) {
      throw new BadGatewayException('AI provider returned an empty response');
    }
    return {
      content,
      promptTokens: body.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  private anthropicRequestBody(
    model: string,
    messages: ChatCompletionMessage[],
  ) {
    const system = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    return {
      model,
      max_tokens: 4096,
      system,
      messages: messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        })),
    };
  }

  private geminiRequestBody(messages: ChatCompletionMessage[]) {
    const system = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    return {
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
      generationConfig: { maxOutputTokens: 4096 },
    };
  }

  private async safeFetch(
    url: string,
    init: RequestInit,
    signal?: AbortSignal,
  ) {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.any(
          [signal, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)].filter(
            (item): item is AbortSignal => Boolean(item),
          ),
        ),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Could not reach the AI provider. Try again shortly.',
      );
    }
  }

  private assertProviderResponse(response: Response, message?: string) {
    if (response.status === 401 || response.status === 403) {
      throw new BadRequestException('The provider API key was rejected.');
    }
    if (!response.ok) {
      throw new BadGatewayException(
        message ?? `AI provider request failed (${response.status})`,
      );
    }
  }
}
