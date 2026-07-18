import { apiFetch } from '@/lib/api/client';
import type { StoredFile } from '@/lib/api/server';

export const TERMINAL_FILE_STATUSES = new Set([
  'READY',
  'QUARANTINED',
  'FAILED',
]);

export function isFileTerminal(file: StoredFile): boolean {
  return TERMINAL_FILE_STATUSES.has(file.processingStatus);
}

export async function waitForFileTerminal(
  initialFile: StoredFile,
  options: { signal?: AbortSignal; intervalMs?: number; timeoutMs?: number } = {},
): Promise<
  | { ok: true; file: StoredFile }
  | { ok: false; error: string; file?: StoredFile }
> {
  const intervalMs = options.intervalMs ?? 1_500;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const deadline = Date.now() + timeoutMs;
  let current = initialFile;

  while (!isFileTerminal(current) && Date.now() < deadline) {
    try {
      await delay(intervalMs, options.signal);
    } catch {
      return { ok: false, error: 'File processing was cancelled.', file: current };
    }

    const result = await apiFetch<StoredFile>(`/files/${current.id}`, {
      signal: options.signal,
    });
    if (!result.ok) {
      return { ok: false, error: result.error, file: current };
    }
    current = result.data;
  }

  if (!isFileTerminal(current)) {
    return {
      ok: false,
      error:
        'This file is still processing. You can follow its status in the file library.',
      file: current,
    };
  }
  return { ok: true, file: current };
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timeout = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}
