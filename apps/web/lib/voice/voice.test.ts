import { describe, expect, it, vi } from 'vitest';
import { createDictationSession, type SpeechRecognitionLike } from './dictation-session';
import { createReplySpeaker } from './reply-speaker';
import { composeDictation, takeSentences, toSpeakableText } from './speakable';

class FakeRecognition implements SpeechRecognitionLike {
  lang = '';
  interimResults = false;
  continuous = false;
  maxAlternatives = 1;
  onresult: ((results: { isFinal: boolean; transcript: string }[]) => void) | null =
    null;
  onerror: ((code: string | undefined) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.onend?.();
  });
}

describe('dictation text', () => {
  it('keeps the existing draft and replaces interim text instead of appending it', () => {
    expect(composeDictation('Hello', [], 'wor')).toBe('Hello wor');
    expect(composeDictation('Hello', [], 'world')).toBe('Hello world');
    expect(composeDictation('Hello', ['world'], '')).toBe('Hello world');
  });

  it('turns markdown into spoken text and splits complete sentences', () => {
    expect(toSpeakableText('**Bold** and `code`.\n```js\nconst x = 1;\n```')).toBe(
      'Bold and code. code sample',
    );
    expect(takeSentences('First sentence. Second')).toEqual({
      ready: ['First sentence.'],
      rest: 'Second',
    });
  });
});

describe('dictation session', () => {
  it('publishes one transcript as interim results grow', () => {
    const created = { current: null as FakeRecognition | null };
    const transcripts: string[] = [];
    const session = createDictationSession({
      createRecognition: () => {
        created.current = new FakeRecognition();
        return created.current;
      },
      language: 'en-US',
      getBaseText: () => 'Draft',
      onTranscript: (text) => transcripts.push(text),
      onListening: () => undefined,
      onError: () => undefined,
    });

    session.start();
    created.current?.onresult?.([
      { isFinal: false, transcript: 'hel' },
    ]);
    created.current?.onresult?.([
      { isFinal: false, transcript: 'hello' },
    ]);
    created.current?.onresult?.([
      { isFinal: true, transcript: 'hello there' },
    ]);

    expect(transcripts).toEqual([
      'Draft hel',
      'Draft hello',
      'Draft hello there',
    ]);
  });

  it('does not restart after the microphone is blocked', () => {
    const created: FakeRecognition[] = [];
    const errors: Array<string | null> = [];
    const session = createDictationSession({
      createRecognition: () => {
        const recognition = new FakeRecognition();
        created.push(recognition);
        return recognition;
      },
      language: 'en-US',
      getBaseText: () => '',
      onTranscript: () => undefined,
      onListening: () => undefined,
      onError: (message) => errors.push(message),
      schedule: (callback) => callback(),
    });

    session.start();
    created[0]?.onerror?.('not-allowed');
    created[0]?.onend?.();

    expect(created).toHaveLength(1);
    expect(errors.at(-1)).toMatch(/microphone/i);
  });

  it('restarts after silence without duplicating the final phrase', () => {
    const created: FakeRecognition[] = [];
    const transcripts: string[] = [];
    const session = createDictationSession({
      createRecognition: () => {
        const recognition = new FakeRecognition();
        created.push(recognition);
        return recognition;
      },
      language: 'en-US',
      getBaseText: () => '',
      onTranscript: (text) => transcripts.push(text),
      onListening: () => undefined,
      onError: () => undefined,
      schedule: (callback) => callback(),
    });

    session.start();
    created[0]?.onresult?.([{ isFinal: true, transcript: 'hello' }]);
    created[0]?.onerror?.('no-speech');
    created[0]?.onend?.();
    created[1]?.onresult?.([{ isFinal: false, transcript: 'again' }]);

    expect(created).toHaveLength(2);
    expect(transcripts.at(-1)).toBe('hello again');
  });
});

describe('reply speaker', () => {
  it('speaks complete sentences in order and stops after cancel', async () => {
    const spoken: string[] = [];
    let release: () => void = () => undefined;
    const speaker = createReplySpeaker({
      speak: (text) => {
        spoken.push(text);
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    });

    speaker.push('Hello there. ');
    speaker.push('More is coming');
    await Promise.resolve();
    expect(spoken).toEqual(['Hello there.']);

    speaker.cancel();
    release();
    speaker.finish();
    await Promise.resolve();
    expect(spoken).toEqual(['Hello there.']);
  });
});
