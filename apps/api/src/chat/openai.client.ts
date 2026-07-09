import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

export type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatCompletionResult = {
  content: string;
  promptTokens: number;
  completionTokens: number;
};

type OpenAiResponse = {
  choices?: { message?: { content?: string } }[];
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
  ): Promise<Response> {
    let response: Response;

    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
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
        }),
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
  ): Promise<ChatCompletionResult> {
    const response = await this.requestCompletion(
      apiKey,
      model,
      messages,
      false,
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

  async *streamChatCompletion(
    apiKey: string,
    model: string,
    messages: ChatCompletionMessage[],
  ): AsyncGenerator<OpenAiStreamPart> {
    const response = await this.requestCompletion(
      apiKey,
      model,
      messages,
      true,
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as OpenAiResponse;
      this.handleErrorResponse(response, body);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new BadGatewayException('OpenAI returned an empty stream');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          continue;
        }

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') {
          continue;
        }

        let parsed: OpenAiStreamChunk;
        try {
          parsed = JSON.parse(payload) as OpenAiStreamChunk;
        } catch {
          continue;
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
}
