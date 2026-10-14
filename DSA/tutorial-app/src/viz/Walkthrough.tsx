import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Frame } from './types';
import { FrameView } from './Viz';

const PLAY_MS = 1600;

/**
 * Step through an algorithm one frame at a time: buttons, a slider, the arrow keys,
 * or Play. Every frame is rendered in the same grid cell, so the box keeps the height
 * of its tallest frame and the page does not jump while stepping.
 */
export function Walkthrough({ title, frames, caption }: { title: string; frames: Frame[]; caption?: ReactNode }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = frames.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (i >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setI((n) => Math.min(n + 1, last)), PLAY_MS);
    return () => clearTimeout(t);
  }, [playing, i, last]);

  if (frames.length === 0) throw new Error(`Walkthrough "${title}" has no frames`);

  const go = (n: number) => {
    setPlaying(false);
    setI(Math.max(0, Math.min(last, n)));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(last);
    else return;
    e.preventDefault();
  };

  return (
    <figure className="wt" aria-label={`Walkthrough: ${title}`}>
      <div className="wt-head">
        <span className="wt-title">{title}</span>
        <span className="wt-count">
          Step {i + 1} of {frames.length}
        </span>
      </div>
      <div className="wt-stage" tabIndex={0} onKeyDown={onKeyDown} aria-label="Walkthrough picture. Use the left and right arrow keys to step.">
        {frames.map((f, k) => (
          <div key={k} className={k === i ? 'wt-frame on' : 'wt-frame'} aria-hidden={k !== i}>
            <FrameView frame={f} />
          </div>
        ))}
      </div>
      <p className="wt-note" aria-live="polite">
        {frames[i].note}
      </p>
      <div className="wt-controls" role="toolbar" aria-label="Walkthrough controls">
        <button type="button" className="chip-btn" onClick={() => go(0)} disabled={i === 0} aria-label="First step">⏮</button>
        <button type="button" className="chip-btn" onClick={() => go(i - 1)} disabled={i === 0}>◀ Back</button>
        <button
          type="button"
          className="chip-btn wt-play"
          onClick={() => {
            if (i >= last) setI(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? 'Pause' : i >= last ? 'Replay' : 'Play'}
        </button>
        <button type="button" className="chip-btn" onClick={() => go(i + 1)} disabled={i === last}>Next ▶</button>
        <button type="button" className="chip-btn" onClick={() => go(last)} disabled={i === last} aria-label="Last step">⏭</button>
        <input
          className="wt-slider"
          type="range"
          min={0}
          max={last}
          value={i}
          onChange={(e) => go(Number(e.target.value))}
          aria-label="Step"
        />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
