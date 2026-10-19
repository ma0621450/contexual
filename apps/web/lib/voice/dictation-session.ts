import { composeDictation, isFatalVoiceError, voiceErrorMessage } from './speakable';

export type NormalizedSpeechResult = {
  isFinal: boolean;
  transcript: string;
};

export type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((results: NormalizedSpeechResult[]) => void) | null;
  onerror: ((code: string | undefined) => void) | null;
  onend: (() => void) | null;
};

export type DictationSessionOptions = {
  createRecognition: () => SpeechRecognitionLike;
  language: string;
  getBaseText: () => string;
  onTranscript: (text: string) => void;
  onListening: (listening: boolean) => void;
  onError: (message: string | null) => void;
  schedule?: (callback: () => void, delayMs: number) => void;
};

const MAX_RESTARTS = 8;

export function createDictationSession(options: DictationSessionOptions) {
  const schedule =
    options.schedule ??
    ((callback, delayMs) => {
      window.setTimeout(callback, delayMs);
    });

  let active = false;
  let fatal = false;
  let restarts = 0;
  let base = '';
  let finals: string[] = [];
  let recognition: SpeechRecognitionLike | null = null;

  function publish(interim: string) {
    options.onTranscript(composeDictation(base, finals, interim));
  }

  function commitFinals() {
    base = composeDictation(base, finals, '');
    finals = [];
  }

  function handleResults(results: NormalizedSpeechResult[]) {
    const nextFinals: string[] = [];
    let interim = '';
    for (const result of results) {
      const transcript = result.transcript.trim();
      if (!transcript) continue;
      if (result.isFinal) nextFinals.push(transcript);
      else interim = transcript;
    }
    finals = nextFinals;
    publish(interim);
  }

  function attach(next: SpeechRecognitionLike) {
    next.lang = options.language;
    next.interimResults = true;
    next.continuous = true;
    next.maxAlternatives = 1;
    next.onresult = handleResults;
    next.onerror = (code) => {
      const message = voiceErrorMessage(code);
      if (message) options.onError(message);
      if (isFatalVoiceError(code)) fatal = true;
      if (code === 'network' && restarts >= 2) fatal = true;
    };
    next.onend = () => {
      if (!active || fatal) {
        options.onListening(false);
        recognition = null;
        return;
      }
      commitFinals();
      if (restarts >= MAX_RESTARTS) {
        fatal = true;
        active = false;
        options.onListening(false);
        options.onError(
          'Voice input reached its session limit. Start it again to continue.',
        );
        recognition = null;
        return;
      }
      restarts += 1;
      schedule(() => {
        if (!active || fatal) return;
        begin();
      }, 250);
    };
  }

  function begin() {
    const next = options.createRecognition();
    recognition = next;
    attach(next);
    try {
      next.start();
      options.onListening(true);
    } catch {
      fatal = true;
      active = false;
      recognition = null;
      options.onListening(false);
      options.onError('Voice input could not start. Try again.');
    }
  }

  return {
    start() {
      if (active) return;
      active = true;
      fatal = false;
      restarts = 0;
      base = options.getBaseText();
      finals = [];
      options.onError(null);
      begin();
    },
    stop() {
      active = false;
      commitFinals();
      publish('');
      const current = recognition;
      recognition = null;
      try {
        current?.stop();
      } catch {
        options.onListening(false);
      }
      if (!current) options.onListening(false);
    },
    replaceBase(text: string) {
      base = text;
      finals = [];
    },
  };
}
