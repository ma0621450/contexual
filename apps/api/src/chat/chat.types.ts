import type { MessageRole } from '@contexual/database';

export type ChatStreamEvent =
  | { type: 'start'; conversationId: string; title: string }
  | { type: 'title'; conversationId: string; title: string }
  | { type: 'token'; content: string }
  | {
      type: 'tool';
      title: string;
      status: 'running' | 'done' | 'error';
      detail?: string;
    }
  | {
      type: 'citation';
      id: string;
      title: string;
      url?: string;
      snippet?: string;
    }
  | { type: 'compare-start'; slot: number; model: string }
  | {
      type: 'done';
      conversationId: string;
      title: string;
      message: {
        id: string;
        role: MessageRole;
        content: string;
        createdAt: Date;
        parentId?: string | null;
        metadata?: { feedback?: 'up' | 'down'; compareSlot?: number; compareWinner?: boolean };
      };
      usage: {
        promptTokens: number;
        completionTokens: number;
        estimatedCostCents: number;
        model: string;
      };
    }
  | { type: 'error'; message: string };
