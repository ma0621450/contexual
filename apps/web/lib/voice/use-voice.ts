'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, apiFetchBlob } from '@/lib/api/client';
import {
  createDictationSession,
  type NormalizedSpeechResult,
  type SpeechRecognitionLike,
} from './dictation-session';
import { createReplySpeaker, type ReplySpeaker } from './reply-speaker';
import { toSpeakableText } from './speakable';

type BrowserRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: BrowserResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type BrowserResultEvent = {
  results: ArrayLike<{
    isFinal: boolean;
    0?: { transcript?: string };
  }>;
};

type RecognitionCtor = new () => BrowserRecognition;

class RecognitionAdapter implements SpeechRecognitionLike {
  lang = 'en-US';
  interimResults = true;
  continuous = true;
  maxAlternatives = 1;
  onresult: ((results: NormalizedSpeechResult[]) => void) | null = null;
  onerror: ((code: string | undefined) => void) | null = null;
  onend: (() => void) | null = null;

  constructor(private readonly inner: BrowserRecognition) {
    inner.onresult = (event) => {
      const results: NormalizedSpeechResult[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        results.push({
          isFinal: Boolean(result?.isFinal),
          transcript: result?.[0]?.transcript ?? '',
        });
      }
      this.onresult?.(results);
    };
    inner.onerror = (event) => this.onerror?.(event?.error);
    inner.onend = () => this.onend?.();
  }

  start() {
    this.inner.lang = this.lang;
    this.inner.interimResults = this.interimResults;
    this.inner.continuous = this.continuous;
    this.inner.maxAlternatives = this.maxAlternatives;
    this.inner.start();
  }

  stop() {
    this.inner.stop();
  }
}

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const browser = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}

let currentAudio: HTMLAudioElement | null = null;

function stopPlayback() {
  currentAudio?.pause();
  currentAudio = null;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function playBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.onpause = done;
    void audio.play().catch(done);
  });
}

function speakLocally(text: string): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = window.navigator.language || 'en-US';
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

async function speakSentence(text: string) {
  const spoken = toSpeakableText(text);
  if (!spoken) return;
  const result = await apiFetchBlob('/chat/speech/synthesize', {
    method: 'POST',
    body: JSON.stringify({ text: spoken }),
  });
  if (result.ok && result.data.size > 0) {
    await playBlob(result.data);
    return;
  }
  await speakLocally(spoken);
}

export function useVoice(options: {
  getText: () => string;
  setText: (value: string) => void;
  setError: (message: string) => void;
  enabled: boolean;
}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const sessionRef = useRef<ReturnType<typeof createDictationSession> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const speakerRef = useRef<ReplySpeaker | null>(null);
  const armedRef = useRef(false);
  const latestRef = useRef('');
  const startedAtRef = useRef(0);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [endedLabel, setEndedLabel] = useState('');

  useEffect(() => {
    if (!endedLabel) return;
    const timer = window.setTimeout(() => setEndedLabel(''), 8000);
    return () => window.clearTimeout(timer);
  }, [endedLabel]);

  function finishListeningClock() {
    const elapsed = Date.now() - startedAtRef.current;
    if (startedAtRef.current && elapsed >= 800) {
      const seconds = Math.max(1, Math.round(elapsed / 1000));
      setEndedLabel(`Voice chat ended · ${seconds}s`);
    }
    startedAtRef.current = 0;
  }

  function stopRecorder() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function stopListening() {
    const pendingTranscription = Boolean(recorderRef.current);
    sessionRef.current?.stop();
    sessionRef.current = null;
    stopRecorder();
    setListening(false);
    return { pendingTranscription, text: latestRef.current };
  }

  function cancelReply() {
    speakerRef.current?.cancel();
    speakerRef.current = null;
    stopPlayback();
    setSpeaking(false);
  }

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      speakerRef.current?.cancel();
      stopPlayback();
    };
  }, []);

  useEffect(() => {
    if (!options.enabled) stopListening();
    // The latest stopListening closes over listening; the enabled flag is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.enabled]);

  async function startRecorder() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      optionsRef.current.setError('Voice input is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        void transcribeRecording(blob);
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setListening(true);
      setEndedLabel('');
      recorder.start();
    } catch {
      optionsRef.current.setError('Allow microphone access to use voice input.');
      setListening(false);
    }
  }

  async function transcribeRecording(blob: Blob) {
    finishListeningClock();
    setListening(false);
    if (blob.size < 800) {
      optionsRef.current.setError('No speech was detected. Try again.');
      return;
    }
    const form = new FormData();
    form.append('file', blob, 'speech.webm');
    const result = await apiFetch<{ text: string }>('/chat/speech/transcribe', {
      method: 'POST',
      body: form,
    });
    if (!result.ok) {
      optionsRef.current.setError(result.error);
      return;
    }
    if (!result.data.text) {
      optionsRef.current.setError('No speech was detected. Try again.');
      return;
    }
    armedRef.current = true;
    const base = optionsRef.current.getText().trim();
    const next = base ? `${base} ${result.data.text}` : result.data.text;
    latestRef.current = next;
    optionsRef.current.setText(next);
    optionsRef.current.setError('');
  }

  function startListening() {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      void startRecorder();
      return;
    }
    const session = createDictationSession({
      createRecognition: () => new RecognitionAdapter(new Ctor()),
      language:
        (typeof navigator !== 'undefined' && navigator.language) || 'en-US',
      getBaseText: () => optionsRef.current.getText(),
      onTranscript: (text) => {
        latestRef.current = text;
        if (text.trim()) armedRef.current = true;
        optionsRef.current.setText(text);
      },
      onListening: (next) => {
        setListening(next);
        if (!next) finishListeningClock();
      },
      onError: (message) => {
        if (message) optionsRef.current.setError(message);
      },
    });
    sessionRef.current = session;
    startedAtRef.current = Date.now();
    setEndedLabel('');
    session.start();
  }

  function toggle() {
    if (!optionsRef.current.enabled) return;
    if (listening || recorderRef.current || sessionRef.current) {
      stopListening();
      return;
    }
    cancelReply();
    startListening();
  }

  function onComposerChange(value: string) {
    latestRef.current = value;
    if (!value.trim()) armedRef.current = false;
    if (listening) sessionRef.current?.replaceBase(value);
    optionsRef.current.setText(value);
  }

  function armReply() {
    const armed = armedRef.current;
    armedRef.current = false;
    return armed;
  }

  function beginReply() {
    cancelReply();
    speakerRef.current = createReplySpeaker({
      speak: speakSentence,
      onSpeaking: setSpeaking,
    });
  }

  return {
    listening,
    speaking,
    endedLabel,
    dismissEnded: () => setEndedLabel(''),
    toggle,
    stopListening,
    cancelReply,
    onComposerChange,
    armReply,
    beginReply,
    pushReply: (delta: string) => speakerRef.current?.push(delta),
    finishReply: () => speakerRef.current?.finish(),
  };
}
