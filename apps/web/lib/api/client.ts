const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
let refreshPromise: Promise<boolean> | null = null;
const AUTH_ROUTES_WITHOUT_REFRESH = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/refresh',
  '/auth/logout',
]);

export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      status?: number;
      code?: string;
      networkError?: boolean;
    };

function getErrorMessage(body: Record<string, unknown>): string {
  if (Array.isArray(body.message) && body.message.length > 0) {
    return String(body.message[0]);
  }
  if (typeof body.message === 'string' && body.message.length > 0) {
    return body.message;
  }
  if (typeof body.error === 'string' && body.error.length > 0) {
    return body.error;
  }
  return 'Request failed';
}

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function fetchWithRefresh(
  path: string,
  options: RequestInit,
): Promise<Response> {
  const request = () =>
    fetch(`${API_BASE}/api${path}`, {
      ...options,
      credentials: 'include',
      headers:
        options.body instanceof FormData
          ? options.headers
          : {
              'Content-Type': 'application/json',
              ...options.headers,
            },
    });

  let response = await request();
  if (response.status === 401 && !AUTH_ROUTES_WITHOUT_REFRESH.has(path)) {
    if (await refreshSession()) {
      response = await request();
    }
  }

  return response;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetchWithRefresh(path, options);
  } catch {
    return {
      ok: false,
      error: 'Unable to reach the server. Check your connection and try again.',
      networkError: true,
    };
  }

  const data = (await response.json().catch(() => ({}))) as T &
    Record<string, unknown>;

  if (!response.ok) {
    return {
      ok: false,
      error: getErrorMessage(data as Record<string, unknown>),
      status: response.status,
      code: typeof data.code === 'string' ? data.code : undefined,
    };
  }

  return { ok: true, data };
}

export type ChatStreamEvent =
  | { type: 'start'; conversationId: string; title: string }
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
  body: {
    conversationId?: string;
    content: string;
    model?: string;
    attachmentIds?: string[];
  },
  onEvent: (event: ChatStreamEvent) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetchWithRefresh('/chat/messages/stream', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      error: 'Unable to reach the server. Check your connection and try again.',
    };
  }

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
