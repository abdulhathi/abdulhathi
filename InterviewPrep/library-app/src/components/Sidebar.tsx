import { findChapter, PRACTICE_PAGES, STACKS, type Chapter } from '../chapters';
import { useProgress } from '../lib/progress';
import { useRatings } from '../lib/ratings';
import { hrefFor } from '../lib/route';
import { useActiveTrack } from '../lib/track';
import { PATHS } from '../paths';
import { PRIORITY_LABEL, TRACKS, type Priority } from '../tracks';

const PRIORITIES: Priority[] = ['must', 'review', 'optional'];

/** Track picker, practice pages, the active track's plan, then the whole library by stack. */
export function Sidebar({ current }: { current: string }) {
  const { done } = useProgress();
  const { ratings } = useRatings();
  const { track, setTrack } = useActiveTrack();
  const weak = Object.values(ratings).filter((r) => r === 'shaky' || r === 'missed').length;
  const currentStack = findChapter(current)?.stack;
  const inPlan = (id: string) => track?.plan.some(([x]) => x === id) ?? false;

  const choose = (value: string) => {
    if (value === '') {
      setTrack(null);
      window.location.hash = '#/';
    } else {
      window.location.hash = hrefFor('track', value);
    }
  };

  return (
    <nav className="toc" aria-label="Library">
      <label className="field track-pick">
        <span>Preparing for</span>
        <select value={track?.id ?? ''} onChange={(e) => choose(e.target.value)}>
          <option value="">No track: whole library</option>
          {TRACKS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.company}: {t.role}
            </option>
          ))}
        </select>
      </label>

      <p className="group">Practice</p>
      <ul className="toc-tools">
        {PRACTICE_PAGES.map((p) => (
          <li key={p.id}>
            <a href={hrefFor(p.id)} className={p.id === current ? 'toc-link is-current' : 'toc-link'} aria-current={p.id === current ? 'page' : undefined}>
              <span className="n">◆</span>
              <span>{p.title}</span>
              <span className={p.id === 'progress' && weak > 0 ? 'tick due' : 'tick'}>{p.id === 'progress' && weak > 0 ? weak : ''}</span>
            </a>
          </li>
        ))}
      </ul>

      <details className="toc-group" open={current.startsWith('path:') || current === 'profile-kit'}>
        <summary className="group">
          <span>Learning paths</span>
          <span className="group-count">{PATHS.length}</span>
        </summary>
        <ol>
          {PATHS.map((p) => (
            <li key={p.id}>
              <a href={hrefFor('path', p.id)} className={current === `path:${p.id}` ? 'toc-link is-current' : 'toc-link'} aria-current={current === `path:${p.id}` ? 'page' : undefined}>
                <span className="n">◇</span>
                <span>{p.title}</span>
                <span className="tick" />
              </a>
            </li>
          ))}
          <li>
            <a href={hrefFor('profile-kit')} className={current === 'profile-kit' ? 'toc-link is-current' : 'toc-link'} aria-current={current === 'profile-kit' ? 'page' : undefined}>
              <span className="n">★</span>
              <span>Profile kit</span>
              <span className="tick" />
            </a>
          </li>
        </ol>
      </details>

      {track && (
        <>
          <p className="group">
            <a href={hrefFor('track', track.id)} className="group-link">{track.company} track</a>
          </p>
          <details className="toc-group" open>
            <summary className="group">Start here</summary>
            <ol>
              {track.start.map((id) => {
                const c = findChapter(id);
                return c ? <ChapterLink key={id} chapter={c} n={c.num} current={id === current} done={false} /> : null;
              })}
            </ol>
          </details>
          {PRIORITIES.map((p) => {
            const items = track.plan.filter(([, x]) => x === p);
            const finished = items.filter(([id]) => done.has(id)).length;
            return (
              <details key={p} className="toc-group" open={p !== 'optional' || items.some(([id]) => id === current)}>
                <summary className="group">
                  <span>{PRIORITY_LABEL[p]}</span>
                  <span className="group-count">{finished}/{items.length}</span>
                </summary>
                <ol>
                  {items.map(([id], i) => {
                    const c = findChapter(id);
                    return c ? <ChapterLink key={id} chapter={c} n={String(i + 1).padStart(2, '0')} current={id === current} done={done.has(id)} /> : null;
                  })}
                </ol>
              </details>
            );
          })}
        </>
      )}

      <p className="group">{track ? 'Whole library' : 'Library by stack'}</p>
      {STACKS.map((s) => {
        const finished = s.chapters.filter((id) => done.has(id)).length;
        // With a track active, a stack opens only when you are reading one of its chapters outside the plan.
        const open = s.id === currentStack && (!track || !inPlan(current));
        return (
          <details key={s.id} className="toc-group" open={open}>
            <summary className="group">
              <span>{s.title}</span>
              <span className="group-count">{finished}/{s.chapters.length}</span>
            </summary>
            <ol>
              {s.chapters.map((id) => {
                const c = findChapter(id);
                return c ? <ChapterLink key={id} chapter={c} n={c.num} current={id === current} done={done.has(id)} /> : null;
              })}
            </ol>
          </details>
        );
      })}
    </nav>
  );
}

function ChapterLink({ chapter, n, current, done }: { chapter: Chapter; n: string; current: boolean; done: boolean }) {
  const cls = ['toc-link', current && 'is-current', done && 'is-done'].filter(Boolean).join(' ');
  return (
    <li>
      <a href={hrefFor(chapter.id)} className={cls} aria-current={current ? 'page' : undefined}>
        <span className="n">{n}</span>
        <span>{chapter.title}</span>
        <span className="tick" aria-label={done ? 'done' : undefined}>{done ? '✓' : ''}</span>
      </a>
    </li>
  );
}
