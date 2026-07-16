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
  ): AsyncGenerator<OpenAiStreamPart> {
    if (provider === AiProvider.OPENAI || provider === AiProvider.XAI) {
      const baseUrl =
        provider === AiProvider.XAI ? 'https://api.x.ai/v1' : undefined;
      yield* this.openAiClient.streamChatCompletion(
        apiKey,
        model,
        messages,
        baseUrl,
      );
      return;
    }

    const completion = await this.createChatCompletion(
      provider,
      apiKey,
      model,
      messages,
    );
    yield { kind: 'delta', content: completion.content };
    yield {
      kind: 'usage',
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
    };
  }

  private async createAnthropicCompletion(
    apiKey: string,
    model: string,
    messages: ChatCompletionMessage[],
  ): Promise<ChatCompletionResult> {
    const system = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
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
          model,
          max_tokens: 4096,
          system,
          messages: messages
            .filter((message) => message.role !== 'system')
            .map((message) => ({
              role: message.role === 'assistant' ? 'assistant' : 'user',
              content: message.content,
            })),
        }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as AnthropicResponse;
    this.assertProviderResponse(response, body.error?.message);
    const content = body.content
      ?.filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('');
    if (!content) throw new BadGatewayException('Anthropic returned no text');
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
    const system = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    const response = await this.safeFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents: messages
            .filter((message) => message.role !== 'system')
            .map((message) => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.content }],
            })),
          generationConfig: { maxOutputTokens: 4096 },
        }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as GeminiResponse;
    this.assertProviderResponse(response, body.error?.message);
    const content = body.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('');
    if (!content) throw new BadGatewayException('Gemini returned no text');
    return {
      content,
      promptTokens: body.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  private async safeFetch(url: string, init: RequestInit) {
    try {
      return await fetch(url, init);
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
