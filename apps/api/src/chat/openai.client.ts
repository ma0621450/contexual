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

@Injectable()
export class OpenAiClient {
  async createChatCompletion(
    apiKey: string,
    model: string,
    messages: ChatCompletionMessage[],
  ): Promise<ChatCompletionResult> {
    let response: Response;

    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages }),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Could not reach OpenAI. Please try again shortly.',
      );
    }

    const body = (await response.json().catch(() => ({}))) as OpenAiResponse;

    if (!response.ok) {
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
}
