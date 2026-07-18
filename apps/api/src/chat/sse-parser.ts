export type SseEvent = {
  event?: string;
  data: string;
};

function parseEventBlock(block: string): SseEvent | null {
  const data: string[] = [];
  let event: string | undefined;

  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue;

    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') event = value;
    if (field === 'data') data.push(value);
  }

  return data.length > 0 ? { event, data: data.join('\n') } : null;
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;

  const drain = function* (final: boolean): Generator<SseEvent> {
    while (true) {
      const boundary = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
      if (!boundary) break;
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      const event = parseEventBlock(
        block.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
      );
      if (event) yield event;
    }

    if (final && buffer) {
      const event = parseEventBlock(
        buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
      );
      buffer = '';
      if (event) yield event;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      yield* drain(false);
    }

    buffer += decoder.decode();
    if (buffer) {
      yield* drain(true);
    }
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}
