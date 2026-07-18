import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './client';

describe('apiFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a recognizable network error when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await expect(apiFetch('/files')).resolves.toEqual({
      ok: false,
      error: 'Unable to reach the server. Check your connection and try again.',
      networkError: true,
    });
  });

  it('preserves structured API status, code, and message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: ['The selected file is not ready'],
            code: 'FILE_NOT_READY',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(apiFetch('/files/file-1')).resolves.toEqual({
      ok: false,
      error: 'The selected file is not ready',
      status: 409,
      code: 'FILE_NOT_READY',
    });
  });

  it('retries one authenticated request after refreshing the session', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'user-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/auth/me')).resolves.toEqual({
      ok: true,
      data: { id: 'user-1' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/refresh');
  });
});
