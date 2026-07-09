const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function getErrorMessage(body: Record<string, unknown>): string {
  if (typeof body.error === 'string') {
    return body.error;
  }
  if (Array.isArray(body.message)) {
    return String(body.message[0]);
  }
  if (typeof body.message === 'string') {
    return body.message;
  }
  return 'Request failed';
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResult<T>> {
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = (await response.json().catch(() => ({}))) as T &
    Record<string, unknown>;

  if (!response.ok) {
    return {
      ok: false,
      error: getErrorMessage(data as Record<string, unknown>),
    };
  }

  return { ok: true, data };
}

export type ChatStreamEvent =
  | { type: 'token'; content: string }
  | {
      type: 'done';
      conversationId: string;
      title: string;
      message: {
        id: string;
        role: 'USER' | 'ASSISTANT' | 'SYSTEM';
        content: string;
        createdAt: string;
      };
    }
  | { type: 'error'; message: string };

export async function streamChat(
  body: { conversationId?: string; content: string },
  onEvent: (event: ChatStreamEvent) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(`${API_BASE}/api/chat/messages/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return { ok: false, error: getErrorMessage(data) };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return { ok: false, error: 'No response stream' };
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          continue;
        }

        const payload = trimmed.slice(5).trim();
        if (!payload) {
          continue;
        }

        try {
          const event = JSON.parse(payload) as ChatStreamEvent;
          onEvent(event);
          if (event.type === 'error') {
            return { ok: false, error: event.message };
          }
        } catch {
          continue;
        }
      }
    }
  }

  return { ok: true };
}
