import { Fragment } from 'react';
import { CHAPTERS, TRACKED, type Chapter } from '../chapters';
import { useProgress } from '../lib/progress';
import { hrefFor } from '../lib/route';

const GROUPS = [...new Set(CHAPTERS.map((c) => c.group))];

export function Sidebar({ current }: { current: string }) {
  const { done } = useProgress();
  const count = TRACKED.filter((c) => done.has(c.id)).length;

  return (
    <nav className="toc" aria-label="Chapters">
      <div className="progress">
        <div className="progress-text">
          {count} of {TRACKED.length} chapters done
        </div>
        <div className="bar" role="progressbar" aria-label="Chapters done" aria-valuemin={0} aria-valuemax={TRACKED.length} aria-valuenow={count}>
          <i style={{ width: `${(count / TRACKED.length) * 100}%` }} />
        </div>
      </div>
      <ol>
        {GROUPS.map((group) => (
          <Fragment key={group}>
            <li className="group">{group}</li>
            {CHAPTERS.filter((c) => c.group === group).map((c) => (
              <ChapterLink key={c.id} chapter={c} current={c.id === current} done={done.has(c.id)} />
            ))}
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

function ChapterLink({ chapter, current, done }: { chapter: Chapter; current: boolean; done: boolean }) {
  const cls = ['toc-link', current && 'is-current', done && 'is-done'].filter(Boolean).join(' ');
  return (
    <li>
      <a href={hrefFor(chapter.id)} className={cls} aria-current={current ? 'page' : undefined}>
        <span className="n">{chapter.num}</span>
        <span>{chapter.title}</span>
        <span className="tick" aria-label={done ? 'done' : undefined}>{done ? '✓' : ''}</span>
      </a>
    </li>
  );
}
