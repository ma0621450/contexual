import { takeSentences, toSpeakableText } from './speakable';

export type ReplySpeaker = {
  push: (delta: string) => void;
  finish: () => void;
  cancel: () => void;
};

export function createReplySpeaker(options: {
  speak: (text: string) => Promise<void>;
  onSpeaking?: (speaking: boolean) => void;
}): ReplySpeaker {
  let cancelled = false;
  let buffer = '';
  let pending = 0;
  let chain: Promise<void> = Promise.resolve();

  function pump(text: string) {
    const spoken = toSpeakableText(text);
    if (!spoken || cancelled) return;
    pending += 1;
    options.onSpeaking?.(true);
    chain = chain.then(async () => {
      try {
        if (!cancelled) await options.speak(spoken);
      } finally {
        pending -= 1;
        if (pending === 0) options.onSpeaking?.(false);
      }
    });
  }

  function drainReady() {
    const taken = takeSentences(buffer);
    buffer = taken.rest;
    for (const sentence of taken.ready) pump(sentence);
  }

  return {
    push(delta) {
      if (cancelled || !delta) return;
      buffer += delta;
      drainReady();
    },
    finish() {
      if (cancelled) return;
      const remainder = buffer.trim();
      buffer = '';
      if (remainder) pump(remainder);
    },
    cancel() {
      cancelled = true;
      buffer = '';
      pending = 0;
      options.onSpeaking?.(false);
    },
  };
}
