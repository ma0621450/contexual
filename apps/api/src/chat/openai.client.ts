import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { parseSseStream } from './sse-parser';

const PROVIDER_TIMEOUT_MS = 120_000;

export type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatCompletionResult = {
  content: string;
  promptTokens: number;
  completionTokens: number;
};

export type ChatToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ChatCompletionWithTools = ChatCompletionResult & {
  toolCalls: ChatToolCall[];
};

type OpenAiResponse = {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: {
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

type OpenAiStreamChunk = {
  choices?: { delta?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

export type OpenAiStreamPart =
  | { kind: 'delta'; content: string }
  | { kind: 'usage'; promptTokens: number; completionTokens: number };

@Injectable()
export class OpenAiClient {
  private async requestCompletion(
    apiKey: string,
    model: string,
    messages: ChatCompletionMessage[],
    stream: boolean,
    baseUrl = 'https://api.openai.com/v1',
    signal?: AbortSignal,
    tools?: unknown[],
  ): Promise<Response> {
    let response: Response;

    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          stream,
          ...(stream ? { stream_options: { include_usage: true } } : {}),
          ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
        }),
        signal: AbortSignal.any(
          [signal, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)].filter(
            (item): item is AbortSignal => Boolean(item),
          ),
        ),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Could not reach OpenAI. Please try again shortly.',
      );
    }

    return response;
  }

  private handleErrorResponse(response: Response, body: OpenAiResponse): never {
    const message = body.error?.message ?? 'OpenAI request failed';

    if (response.status === 401) {
      throw new BadRequestException(
        'The stored OpenAI API key was rejected. Please reconnect the provider.',
      );
    }

    if (response.status === 429) {
      throw new ServiceUnavailableException(
        'OpenAI rate limit or quota reached. Try again later.',
      );
    }

    throw new BadGatewayException(message);
  }

  async createChatCompletion(
    apiKey: string,
    model: string,
    messages: ChatCompletionMessage[],
    baseUrl?: string,
  ): Promise<ChatCompletionResult> {
    const response = await this.requestCompletion(
      apiKey,
      model,
      messages,
      false,
      baseUrl,
    );
    const body = (await response.json().catch(() => ({}))) as OpenAiResponse;

    if (!response.ok) {
      this.handleErrorResponse(response, body);
    }

    const content = body.choices?.[0]?.message?.content;

    if (typeof content !== 'string') {
      throw new BadGatewayException('OpenAI returned an empty response');
    }

    return {
      content,
      promptTokens: body.usage?.prompt_tokens ?? 0,
      completionTokens: body.usage?.completion_tokens ?? 0,
    };
  }

  async createChatCompletionWithTools(
    apiKey: string,
    model: string,
    messages: ChatCompletionMessage[],
    tools: unknown[],
    baseUrl?: string,
    signal?: AbortSignal,
  ): Promise<ChatCompletionWithTools> {
    const response = await this.requestCompletion(
      apiKey,
      model,
      messages,
      false,
      baseUrl,
      signal,
      tools,
    );
    const body = (await response.json().catch(() => ({}))) as OpenAiResponse;

    if (!response.ok) {
      this.handleErrorResponse(response, body);
    }

    const message = body.choices?.[0]?.message;
    const toolCalls = (message?.tool_calls ?? [])
      .filter((call) => call.function?.name)
      .map((call, index) => ({
        id: call.id ?? `tool-${index}`,
        name: call.function?.name ?? '',
        arguments: (() => {
          try {
            return JSON.parse(call.function?.arguments || '{}') as Record<
              string,
              unknown
            >;
          } catch {
            return { query: call.function?.arguments };
          }
        })(),
      }));

    return {
      content: typeof message?.content === 'string' ? message.content : '',
      toolCalls,
      promptTokens: body.usage?.prompt_tokens ?? 0,
      completionTokens: body.usage?.completion_tokens ?? 0,
    };
  }

  async *streamChatCompletion(
    apiKey: string,
    model: string,
    messages: ChatCompletionMessage[],
    baseUrl?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<OpenAiStreamPart> {
    const response = await this.requestCompletion(
      apiKey,
      model,
      messages,
      true,
      baseUrl,
      signal,
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as OpenAiResponse;
      this.handleErrorResponse(response, body);
    }

    if (!response.body) {
      throw new BadGatewayException('AI provider returned an empty stream');
    }

    for await (const event of parseSseStream(response.body)) {
      if (!event.data || event.data === '[DONE]') continue;

      let parsed: OpenAiStreamChunk;
      try {
        parsed = JSON.parse(event.data) as OpenAiStreamChunk;
      } catch {
        continue;
      }
      if (parsed.error?.message || event.event === 'error') {
        throw new BadGatewayException(
          parsed.error?.message ?? 'AI provider stream failed',
        );
      }

      const delta = parsed.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        yield { kind: 'delta', content: delta };
      }

      if (parsed.usage) {
        yield {
          kind: 'usage',
          promptTokens: parsed.usage.prompt_tokens ?? 0,
          completionTokens: parsed.usage.completion_tokens ?? 0,
        };
      }
    }
  }
}
