import type { MessageRole } from '@contexual/database';

export type ChatStreamEvent =
  | { type: 'start'; conversationId: string; title: string }
  | { type: 'token'; content: string }
  | {
      type: 'done';
      conversationId: string;
      title: string;
      message: {
        id: string;
        role: MessageRole;
        content: string;
        createdAt: Date;
      };
      usage: {
        promptTokens: number;
        completionTokens: number;
        estimatedCostCents: number;
        model: string;
      };
    }
  | { type: 'error'; message: string };
