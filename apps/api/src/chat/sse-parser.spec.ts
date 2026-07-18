import { parseSseStream } from './sse-parser';

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('parseSseStream', () => {
  it('handles fragmented CRLF, comments, multiple data lines, and final data', async () => {
    const events = [];
    const stream = streamFrom([
      ': keep-alive\r',
      '\n',
      'event: update\r\n',
      'data: first\r\n',
      'data: second\r',
      '\n\r\n',
      'data: final',
    ]);

    for await (const event of parseSseStream(stream)) events.push(event);

    expect(events).toEqual([
      { event: 'update', data: 'first\nsecond' },
      { event: undefined, data: 'final' },
    ]);
  });

  it('handles LF event boundaries split across chunks', async () => {
    const events = [];
    for await (const event of parseSseStream(
      streamFrom(['data: one\n', '\ndata: two\n\n']),
    )) {
      events.push(event.data);
    }
    expect(events).toEqual(['one', 'two']);
  });
});
