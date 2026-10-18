import { useCallback, useEffect, useRef, useState } from 'react';

// Speech-to-text with the browser's Web Speech API (Chrome and Edge; Chrome sends the audio to Google's speech service).
// Text-to-speech uses speechSynthesis, which runs locally.

type Alternative = { transcript: string };
type Result = { isFinal: boolean; 0: Alternative; length: number };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<Result> };
type RecognitionErrorEvent = { error: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow the microphone for this site in the address bar, then try again.',
  'service-not-allowed': 'Speech recognition is not allowed in this browser. You can type your answer instead.',
  'no-speech': 'No speech was heard. Check your microphone and try again.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs an internet connection (Chrome sends audio to its speech service).',
};

/** Live dictation. `text` is the committed transcript plus whatever is being heard right now. */
export function useDictation(lang = 'en-US') {
  const Ctor = typeof window === 'undefined' ? undefined : recognitionCtor();
  const [listening, setListening] = useState(false);
  const [committed, setCommitted] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [spokenMs, setSpokenMs] = useState(0);
  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false); // Chrome stops after a pause; restart while the user still wants to talk

  useEffect(
    () => () => {
      wanted.current = false;
      rec.current?.abort();
    },
    [],
  );

  const start = useCallback(() => {
    if (!Ctor || rec.current) return;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finalText = '';
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else live += res[0].transcript;
      }
      if (finalText) setCommitted((c) => `${c} ${finalText}`.replace(/\s+/g, ' ').trimStart());
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === 'aborted') return;
      if (e.error !== 'no-speech') wanted.current = false;
      setError(ERRORS[e.error] ?? `Speech recognition error: ${e.error}`);
    };
    r.onend = () => {
      setInterim('');
      if (wanted.current) {
        try {
          r.start();
          return;
        } catch {
          /* fall through and stop */
        }
      }
      rec.current = null;
      setListening(false);
      setStartedAt((s) => {
        if (s !== null) setSpokenMs((ms) => ms + (Date.now() - s));
        return null;
      });
    };
    setError('');
    wanted.current = true;
    rec.current = r;
    r.start();
    setListening(true);
    setStartedAt(Date.now());
  }, [Ctor, lang]);

  const stop = useCallback(() => {
    wanted.current = false;
    rec.current?.stop();
  }, []);

  const reset = useCallback(() => {
    wanted.current = false;
    rec.current?.abort();
    rec.current = null;
    setListening(false);
    setCommitted('');
    setInterim('');
    setError('');
    setStartedAt(null);
    setSpokenMs(0);
  }, []);

  return {
    supported: Boolean(Ctor),
    listening,
    // Trim only while words are still arriving: trimming typed text would eat each space as you type it.
    text: interim ? `${committed} ${interim}`.trim() : committed,
    setText: setCommitted,
    error,
    start,
    stop,
    reset,
    /** Milliseconds spent recording, for words-per-minute. */
    spokenMs: spokenMs + (startedAt !== null ? Date.now() - startedAt : 0),
  };
}

/** Read text aloud with the system voice. Returns a function that stops it. */
export function speak(text: string, lang = 'en-US'): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return () => {};
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 1;
  window.speechSynthesis.speak(u);
  return () => window.speechSynthesis.cancel();
}

const FILLERS = ['um', 'uh', 'erm', 'like', 'basically', 'actually', 'you know', 'i mean', 'kind of', 'sort of', 'so yeah'];

export type SpeakingStats = ReturnType<typeof speakingStats>;

/** Speaking metrics for a spoken answer: length, pace, and filler words. */
export function speakingStats(text: string, ms: number) {
  const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  const joined = ` ${words.join(' ')} `;
  const fillers = FILLERS.map((f) => ({ word: f, count: joined.split(` ${f} `).length - 1 })).filter((f) => f.count > 0);
  const minutes = ms / 60_000;
  return {
    words: words.length,
    seconds: Math.round(ms / 1000),
    wpm: minutes > 0.05 ? Math.round(words.length / minutes) : null,
    fillers,
    fillerCount: fillers.reduce((s, f) => s + f.count, 0),
  };
}
