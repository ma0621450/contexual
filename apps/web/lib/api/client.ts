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
