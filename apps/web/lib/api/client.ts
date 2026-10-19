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

export async function apiFetchBlob(
  path: string,
  options: RequestInit = {},
): Promise<ApiResult<Blob>> {
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

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: false,
      error: getErrorMessage(data),
      status: response.status,
      code: typeof data.code === 'string' ? data.code : undefined,
    };
  }

  return { ok: true, data: await response.blob() };
}

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
        role: 'USER' | 'ASSISTANT' | 'SYSTEM';
        content: string;
        createdAt: string;
        parentId?: string | null;
        metadata?: {
          feedback?: 'up' | 'down';
          compareSlot?: number;
          compareWinner?: boolean;
          compareMerged?: boolean;
        };
      };
      usage: {
        promptTokens: number;
        completionTokens: number;
        estimatedCostCents: number;
        model: string;
      };
    }
  | { type: 'error'; message: string };

async function consumeChatStream(
  response: Response,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: string; aborted?: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { ok: false, error: 'No response stream' };
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        return { ok: false, error: 'Generation stopped', aborted: true };
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        for (const line of chunk.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload) continue;
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
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof DOMException && error.name === 'AbortError')
    ) {
      return { ok: false, error: 'Generation stopped', aborted: true };
    }
    throw error;
  }

  return { ok: true };
}

async function streamChatRequest(
  path: string,
  body: unknown,
  onEvent: (event: ChatStreamEvent) => void,
  options?: { signal?: AbortSignal },
): Promise<{ ok: true } | { ok: false; error: string; aborted?: boolean }> {
  let response: Response;
  try {
    response = await fetchWithRefresh(path, {
      method: 'POST',
      body: JSON.stringify(body),
      signal: options?.signal,
    });
  } catch (error) {
    if (
      options?.signal?.aborted ||
      (error instanceof DOMException && error.name === 'AbortError')
    ) {
      return { ok: false, error: 'Generation stopped', aborted: true };
    }
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

  return consumeChatStream(response, onEvent, options?.signal);
}

export async function searchConversations(query: string, archived = false) {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (archived) params.set('archived', 'true');
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<
    Array<{
      id: string;
      title: string;
      model: string;
      provider: string;
      updatedAt: string;
      pinnedAt?: string | null;
      folderId?: string | null;
      isShared?: boolean;
      isArchived?: boolean;
      snippet?: string;
    }>
  >(`/chat/conversations${suffix}`);
}

export async function updateConversation(
  id: string,
  data: {
    title?: string;
    folderId?: string | null;
    pinned?: boolean;
    instructions?: string | null;
    webSearchEnabled?: boolean;
  },
) {
  return apiFetch<{
    id: string;
    title: string;
    updatedAt: string;
    folderId?: string | null;
    pinnedAt?: string | null;
    instructions?: string | null;
    webSearchEnabled?: boolean;
  }>(`/chat/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function renameConversation(id: string, title: string) {
  return apiFetch<{ id: string; title: string; updatedAt: string }>(
    `/chat/conversations/${id}`,
    { method: 'PATCH', body: JSON.stringify({ title }) },
  );
}

export async function deleteMessage(messageId: string) {
  return apiFetch<{ ok: true; conversationId: string }>(
    `/chat/messages/${messageId}`,
    { method: 'DELETE' },
  );
}

export async function setMessageFeedback(
  messageId: string,
  rating: 'up' | 'down' | 'none',
) {
  return apiFetch<{ ok: true; feedback: 'up' | 'down' | null }>(
    `/chat/messages/${messageId}/feedback`,
    { method: 'PATCH', body: JSON.stringify({ rating }) },
  );
}

export async function streamEditMessage(
  messageId: string,
  body: { content: string; model?: string },
  onEvent: (event: ChatStreamEvent) => void,
  options?: { signal?: AbortSignal },
) {
  return streamChatRequest(
    `/chat/messages/${messageId}/edit/stream`,
    body,
    onEvent,
    options,
  );
}

export async function listChatFolders() {
  return apiFetch<
    Array<{
      id: string;
      name: string;
      createdAt: string;
      instructions?: string | null;
      defaultModel?: string | null;
      fileIds?: string[];
    }>
  >('/chat/folders');
}

export async function createChatFolder(name: string) {
  return apiFetch<{
    id: string;
    name: string;
    createdAt: string;
    instructions?: string | null;
    defaultModel?: string | null;
    fileIds?: string[];
  }>('/chat/folders', { method: 'POST', body: JSON.stringify({ name }) });
}

export async function renameChatFolder(id: string, name: string) {
  return apiFetch<{
    id: string;
    name: string;
    createdAt: string;
    instructions?: string | null;
    defaultModel?: string | null;
    fileIds?: string[];
  }>(`/chat/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function updateChatFolder(
  id: string,
  body: {
    name?: string;
    instructions?: string | null;
    defaultModel?: string | null;
    fileIds?: string[];
  },
) {
  return apiFetch<{
    id: string;
    name: string;
    createdAt: string;
    instructions?: string | null;
    defaultModel?: string | null;
    fileIds?: string[];
  }>(`/chat/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteChatFolder(id: string) {
  return apiFetch<{ ok: true }>(`/chat/folders/${id}`, {
    method: 'DELETE',
  });
}

export async function restoreConversation(id: string) {
  return apiFetch<{ ok: true }>(`/chat/conversations/${id}/restore`, {
    method: 'POST',
  });
}

export async function shareConversation(
  id: string,
  expiresIn?: '1h' | '24h' | '7d' | 'never',
) {
  return apiFetch<{
    id: string;
    shareToken: string;
    isShared: boolean;
    shareExpiresAt?: string | null;
  }>(`/chat/conversations/${id}/share`, {
    method: 'POST',
    body: JSON.stringify({ expiresIn: expiresIn ?? 'never' }),
  });
}

export async function unshareConversation(id: string) {
  return apiFetch<{ id: string; shareToken: string | null; isShared: boolean }>(
    `/chat/conversations/${id}/share`,
    { method: 'DELETE' },
  );
}

export async function selectMessageBranch(messageId: string) {
  return apiFetch<{ ok: true; activeLeafId: string; conversationId: string }>(
    `/chat/messages/${messageId}/select`,
    { method: 'POST' },
  );
}

export async function pickCompareWinner(messageId: string) {
  return apiFetch<{ ok: true; messageId: string }>(
    `/chat/messages/${messageId}/pick-compare`,
    { method: 'POST' },
  );
}

export async function mergeCompareResponses(messageId: string) {
  return apiFetch<{ ok: true; messageId: string }>(
    `/chat/messages/${messageId}/merge-compare`,
    { method: 'POST' },
  );
}

export async function runSandbox(language: string, code: string) {
  return apiFetch<{ language: string; output: string }>('/chat/sandbox', {
    method: 'POST',
    body: JSON.stringify({ language, code }),
  });
}

export async function streamChat(
  body: {
    conversationId?: string;
    content: string;
    model?: string;
    attachmentIds?: string[];
    webSearch?: boolean;
    compareModel?: string;
    parentMessageId?: string;
    folderId?: string;
  },
  onEvent: (event: ChatStreamEvent) => void,
  options?: { signal?: AbortSignal },
) {
  return streamChatRequest('/chat/messages/stream', body, onEvent, options);
}

export async function streamRegenerate(
  body: {
    conversationId: string;
    assistantMessageId: string;
    model?: string;
  },
  onEvent: (event: ChatStreamEvent) => void,
  options?: { signal?: AbortSignal },
) {
  return streamChatRequest(
    '/chat/messages/regenerate/stream',
    body,
    onEvent,
    options,
  );
}
