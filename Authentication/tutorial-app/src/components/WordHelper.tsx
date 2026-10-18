import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Select-to-understand, as in Study Scheduler: double-click a word to translate it, or select a phrase or sentence
// to get a small chip with Speak, Translate and Explain (a short Claude explanation in the context of the page).
// Mount once near the app root. Selections inside fields and the code editor are left alone.

type Mode = 'translate' | 'explain';
type Popup = {
  mode: Mode;
  text: string;
  x: number;
  y: number;
  loading: boolean;
  translations: string[];
  explanation: string;
  model: string;
  error: string | null;
  cached: boolean;
  context: string;
};
type Chip = { text: string; x: number; y: number; context: string };

const POPUP_W = 340;
const POPUP_H = 220;
const PAD = 12;
const MAX_LEN = 500;
const CHIP_ID = 'word-helper-chip';
const POPUP_ID = 'word-helper-popup';
const LANG_LABEL: Record<string, string> = { ta: 'Tamil', hi: 'Hindi', te: 'Telugu', ml: 'Malayalam', kn: 'Kannada', es: 'Spanish', fr: 'French' };
const LANG_GLYPH: Record<string, string> = { ta: 'த', hi: 'अ', te: 'అ', ml: 'അ', kn: 'ಅ' };

const popupWidth = () => Math.min(POPUP_W, window.innerWidth - 2 * PAD);

function insideEditable(node: Node | null): boolean {
  for (let el: Node | null = node; el; el = el.parentNode) {
    if (el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return true;
  }
  return false;
}

/** Trim whitespace and punctuation from the ends; keep hyphens, apostrophes and punctuation inside. */
export function normalizeSelection(raw: string): string {
  return raw.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
}

/** About 2,000 characters of the text around the selection, so Explain answers in context. */
function selectionContext(selected: string, maxLen = 2000): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  const node = sel.getRangeAt(0).commonAncestorContainer;
  let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
  while (el && (el.textContent?.length ?? 0) < 600 && el.parentElement && el.tagName !== 'BODY') el = el.parentElement;
  const full = (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (full.length <= maxLen) return full;
  const i = full.indexOf(selected.trim());
  if (i < 0) return full.slice(0, maxLen);
  const start = Math.max(0, i - Math.floor(maxLen / 2));
  return full.slice(start, start + maxLen);
}

function place(x: number, y: number) {
  return {
    x: Math.min(Math.max(x + 8, PAD), window.innerWidth - popupWidth() - PAD),
    y: Math.max(PAD, Math.min(y + 12, window.innerHeight - POPUP_H - PAD)),
  };
}

/** Read the English text aloud (the source phrase, not the translation). */
function speak(text: string) {
  if (!('speechSynthesis' in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.trim());
  u.lang = 'en-US';
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

const SpeakerIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M7 3.5L4 6H2v4h2l3 2.5v-9zM10.5 5.5a3 3 0 010 5l-.86-.86a2 2 0 000-3.28L10.5 5.5zm1.5-2a5 5 0 010 9l-.86-.86a4 4 0 000-7.28L12 3.5z" />
  </svg>
);
const SparkleIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 1l1.3 3.7L13 6l-3.7 1.3L8 11 6.7 7.3 3 6l3.7-1.3L8 1zM13 10l.7 1.8L15.5 12l-1.8.7L13 14.5l-.7-1.8L10.5 12l1.8-.7L13 10z" />
  </svg>
);

type Props = {
  /** Translation target, a two-letter language code. Default: Tamil. */
  target?: string;
  /** Headers that prove a request comes from this app's own page, e.g. { 'X-Interview-Library': '1' }. */
  headers: Record<string, string>;
  /** The Claude model for Explain (the server falls back to its default). */
  model?: string;
};

async function call<T>(input: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new Error('Could not reach the app’s dev server.');
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.error ?? `The server answered ${res.status}.`);
  return data;
}

export function WordHelper({ target = 'ta', headers, model }: Props) {
  const [popup, setPopup] = useState<Popup | null>(null);
  const [chip, setChip] = useState<Chip | null>(null);
  const close = useCallback(() => setPopup(null), []);
  const lang = LANG_LABEL[target] ?? target.toUpperCase();
  const glyph = LANG_GLYPH[target] ?? target.toUpperCase();

  const open = useCallback((text: string, x: number, y: number, mode: Mode, context: string) => {
    setChip(null);
    setPopup({ mode, text, ...place(x, y), loading: true, translations: [], explanation: '', model: '', error: null, cached: false, context });
  }, []);
  const switchMode = useCallback((mode: Mode) => {
    setPopup((p) => (p && p.mode !== mode ? { ...p, mode, loading: true, translations: [], explanation: '', model: '', error: null, cached: false } : p));
  }, []);

  // Double-click a word: translate it straight away.
  useEffect(() => {
    const onDbl = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest(`#${POPUP_ID}, #${CHIP_ID}`) || insideEditable(e.target as Node)) return;
      const text = normalizeSelection(window.getSelection()?.toString() ?? '');
      if (!text || text.length > MAX_LEN) return;
      open(text, e.clientX, e.clientY, 'translate', selectionContext(text));
    };
    document.addEventListener('dblclick', onDbl);
    return () => document.removeEventListener('dblclick', onDbl);
  }, [open]);

  // Select two or more words: offer the chip next to the selection.
  useEffect(() => {
    const onUp = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest(`#${POPUP_ID}, #${CHIP_ID}`) || insideEditable(e.target as Node)) return;
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel && sel.rangeCount > 0 ? normalizeSelection(sel.toString()) : '';
        if (!sel || !text || text.length > MAX_LEN || text.split(/\s+/).length < 2) return setChip(null);
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return setChip(null);
        setChip({
          text,
          x: Math.max(PAD, Math.min(rect.right + 6, window.innerWidth - 220 - PAD)),
          y: Math.max(PAD, Math.min(rect.bottom + 4, window.innerHeight - 40 - PAD)),
          context: selectionContext(text),
        });
      }, 0);
    };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, []);

  // The chip's position goes stale when the page scrolls or resizes.
  useEffect(() => {
    if (!chip) return;
    const hide = () => setChip(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [chip]);

  // Fetch whatever the open popup asks for.
  const text = popup?.text;
  const mode = popup?.mode;
  const loading = popup?.loading;
  const context = popup?.context ?? '';
  useEffect(() => {
    if (!text || !loading) return;
    let live = true;
    const done = (patch: Partial<Popup>) => live && setPopup((p) => (p && p.text === text && p.mode === mode ? { ...p, loading: false, ...patch } : p));
    const request =
      mode === 'translate'
        ? call<{ translations: string[]; cached: boolean }>(`/api/words/translate?${new URLSearchParams({ text, target })}`, { headers }).then((r) =>
            done({ translations: r.translations, cached: r.cached }),
          )
        : call<{ explanation: string; model: string; cached: boolean }>('/api/words/explain', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, context, model }),
          }).then((r) => done({ explanation: r.explanation, model: r.model, cached: r.cached }));
    request.catch((e: unknown) => done({ error: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
    // headers is a fresh object each render; its content does not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, mode, loading, target, model]);

  // Escape or a click outside closes the popup.
  useEffect(() => {
    if (!popup) return;
    const onDown = (e: MouseEvent) => {
      if (!document.getElementById(POPUP_ID)?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [popup, close]);

  return (
    <>
      {chip &&
        createPortal(
          // preventDefault on mousedown keeps the selection alive while a chip button is pressed.
          <div id={CHIP_ID} className="wh-chip" style={{ left: chip.x, top: chip.y }} onMouseDown={(e) => e.preventDefault()} role="toolbar" aria-label="Selected text">
            <button type="button" className="wh-speak" onClick={() => speak(chip.text)} title="Read aloud (English)" aria-label="Read aloud">
              <SpeakerIcon />
            </button>
            <button type="button" className="wh-translate" onClick={() => open(chip.text, chip.x, chip.y, 'translate', chip.context)} title={`Translate to ${lang}`}>
              <span className="wh-glyph" aria-hidden="true">{glyph}</span> Translate
            </button>
            <button type="button" className="wh-explain" onClick={() => open(chip.text, chip.x, chip.y, 'explain', chip.context)} title="Explain with Claude">
              <SparkleIcon /> Explain
            </button>
          </div>,
          document.body,
        )}
      {popup &&
        createPortal(
          <div id={POPUP_ID} className="wh-popup" style={{ left: popup.x, top: popup.y, width: popupWidth() }} role="dialog" aria-label={popup.mode === 'explain' ? 'Explanation' : 'Translation'}>
            <div className="wh-head">
              <span className={popup.mode === 'explain' ? 'wh-mode explain' : 'wh-mode'}>{popup.mode === 'explain' ? 'Explain' : `EN → ${target.toUpperCase()}`}</span>
              <span className="wh-term" title={popup.text}>{popup.text}</span>
              <button type="button" onClick={() => speak(popup.text)} title="Read aloud (English)" aria-label="Read aloud">
                <SpeakerIcon />
              </button>
              {popup.mode === 'explain' ? (
                <button type="button" className="wh-glyph" onClick={() => switchMode('translate')} title={`Translate to ${lang}`} aria-label={`Translate to ${lang}`}>
                  {glyph}
                </button>
              ) : (
                <button type="button" className="wh-sparkle" onClick={() => switchMode('explain')} title="Explain with Claude" aria-label="Explain with Claude">
                  <SparkleIcon />
                </button>
              )}
              <button type="button" onClick={close} title="Close (Esc)" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="wh-body" aria-live="polite">
              {popup.loading ? (
                <p className="wh-wait">
                  <span className={popup.mode === 'explain' ? 'wh-spin explain' : 'wh-spin'} aria-hidden="true" />
                  {popup.mode === 'explain' ? 'Asking Claude…' : 'Translating…'}
                </p>
              ) : popup.error ? (
                <p className="wh-error" role="alert">{popup.error}</p>
              ) : popup.mode === 'explain' ? (
                <p className="wh-explanation">{popup.explanation}</p>
              ) : (
                <ol className="wh-list">
                  {popup.translations.map((t, i) => (
                    <li key={i} className={i === 0 ? 'first' : undefined}>{t}</li>
                  ))}
                </ol>
              )}
            </div>
            <div className="wh-foot">
              <span>{popup.mode === 'explain' ? `via Claude${popup.model ? ` · ${popup.model}` : ''}` : 'via MyMemory'}</span>
              {popup.cached && <span className="wh-cached">cached</span>}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
