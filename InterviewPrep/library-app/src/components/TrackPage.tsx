import { useEffect } from 'react';
import { findChapter } from '../chapters';
import { problemsOf, questionsOf } from '../lib/md';
import { useProgress } from '../lib/progress';
import { useRatings } from '../lib/ratings';
import { hrefFor } from '../lib/route';
import { useActiveTrack } from '../lib/track';
import { PRIORITY_LABEL, type Priority, type Track } from '../tracks';

const PRIORITIES: Priority[] = ['must', 'review', 'optional'];

/** One job description: its own chapters, then the library chapters it needs, by priority. Opening it makes it active. */
export function TrackPage({ track }: { track: Track }) {
  const { setTrack } = useActiveTrack();
  const { done } = useProgress();
  const { ratings } = useRatings();
  useEffect(() => setTrack(track.id), [track.id, setTrack]);

  return (
    <div className="track-page">
      <p className="md prose">{track.context}</p>
      <p className="ch-meta">
        <span>{track.status}</span>
        <span>{track.plan.length} library chapters</span>
        <span>{track.plan.filter(([id]) => done.has(id)).length} done</span>
      </p>
      <div className="track-actions">
        <a className="chip-btn reveal" href={hrefFor(track.start[0])}>Start with the study plan</a>
        <a className="chip-btn" href={hrefFor('mock')}>Mock interview</a>
        <a className="chip-btn" href={hrefFor('drill')}>Flash-card drill</a>
      </div>

      <section className="ch-section" aria-labelledby="start-h">
        <h2 id="start-h">Start here</h2>
        <ol className="plan-list">
          {track.start.map((id, i) => (
            <li key={id}>
              <span className="plan-n">{String.fromCharCode(65 + i)}</span>
              <a href={hrefFor(id)}>{findChapter(id)?.title ?? id}</a>
            </li>
          ))}
        </ol>
      </section>

      {PRIORITIES.map((p) => {
        const items = track.plan.filter(([, x]) => x === p);
        if (!items.length) return null;
        const minutes = items.reduce((s, [id]) => s + (findChapter(id)?.minutes ?? 0), 0);
        return (
          <section key={p} className="ch-section" aria-labelledby={`p-${p}`}>
            <h2 id={`p-${p}`}>
              {PRIORITY_LABEL[p]} <span className="mock-min">{items.length} chapters · about {Math.round(minutes / 60)} h</span>
            </h2>
            <ol className="plan-list">
              {items.map(([id, , why], i) => {
                const c = findChapter(id);
                if (!c) return null;
                const keys = [...questionsOf(c.doc).map((q) => `${id}/${q.id}`), ...problemsOf(c.doc).map((x) => `${id}/${x.id}`)];
                const rated = keys.filter((k) => ratings[k]).length;
                return (
                  <li key={id} className={done.has(id) ? 'is-done' : undefined}>
                    <span className="plan-n">{i + 1}</span>
                    <div className="plan-main">
                      <a href={hrefFor(id)}>{c.title}</a>
                      <span className="plan-meta">
                        {c.group} · {c.minutes} min · {rated}/{keys.length} rated{done.has(id) ? ' · done ✓' : ''}
                      </span>
                      {why && <span className="plan-why">{why}</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
