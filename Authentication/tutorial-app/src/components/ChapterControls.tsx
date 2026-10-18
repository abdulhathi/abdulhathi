import type { Chapter } from '../chapters';
import { useProgress } from '../lib/progress';
import { hrefFor } from '../lib/route';
import type { ThemeMode } from '../lib/theme';

export function DoneToggle({ id }: { id: string }) {
  const { done, toggle } = useProgress();
  return (
    <label className="done">
      <input type="checkbox" id={`done-${id}`} checked={done.has(id)} onChange={() => toggle(id)} />
      I finished this chapter
    </label>
  );
}

export function Pager({ prev, next }: { prev?: Chapter; next?: Chapter }) {
  return (
    <nav className="pager" aria-label="Previous and next chapter">
      {prev ? (
        <a className="pager-link" href={hrefFor(prev.id)}>
          <span className="pager-dir">← Previous</span>
          <span className="pager-title">{prev.num} · {prev.title}</span>
        </a>
      ) : (
        <span />
      )}
      {next && (
        <a className="pager-link next" href={hrefFor(next.id)}>
          <span className="pager-dir">Next →</span>
          <span className="pager-title">{next.num} · {next.title}</span>
        </a>
      )}
    </nav>
  );
}

const THEME_LABEL: Record<ThemeMode, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };

export function ThemeToggle({ mode, onCycle }: { mode: ThemeMode; onCycle: () => void }) {
  return (
    <button type="button" className="chip-btn" onClick={onCycle} title="Switch between automatic, light and dark theme">
      Theme: {THEME_LABEL[mode]}
    </button>
  );
}
