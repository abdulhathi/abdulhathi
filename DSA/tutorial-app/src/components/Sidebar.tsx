import { CHAPTERS, PRACTICE_PAGES, TRACKED, type Chapter } from '../chapters';
import { dueIds, useProblems } from '../lib/problems';
import { useProgress } from '../lib/progress';
import { hrefFor } from '../lib/route';
import { PLACEMENTS } from '../topics';

const GROUPS = [...new Set(CHAPTERS.map((c) => c.group))];

export function Sidebar({ current }: { current: string }) {
  const { done } = useProgress();
  const { records } = useProblems();
  const count = TRACKED.filter((c) => done.has(c.id)).length;
  const solved = [...PLACEMENTS.keys()].filter((id) => ['solved', 'mastered'].includes(records[id]?.status ?? '')).length;
  const due = dueIds(records).length;
  const currentGroup = CHAPTERS.find((c) => c.id === current)?.group;

  const extra: Record<string, string> = {
    tracker: `${solved}/${PLACEMENTS.size}`,
    drill: '',
    review: due > 0 ? `${due} due` : '',
  };

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

      <p className="group">Practice</p>
      <ul className="toc-tools">
        {PRACTICE_PAGES.map((p) => (
          <li key={p.id}>
            <a href={hrefFor(p.id)} className={p.id === current ? 'toc-link is-current' : 'toc-link'} aria-current={p.id === current ? 'page' : undefined}>
              <span className="n">◆</span>
              <span>{p.title}</span>
              <span className={p.id === 'review' && due > 0 ? 'tick due' : 'tick'}>{extra[p.id]}</span>
            </a>
          </li>
        ))}
      </ul>

      {GROUPS.map((group) => {
        const list = CHAPTERS.filter((c) => c.group === group);
        const finished = list.filter((c) => done.has(c.id)).length;
        return (
          <details key={group} className="toc-group" open={group === currentGroup || group === 'Start here'}>
            <summary className="group">
              <span>{group}</span>
              {list[0].kind !== 'reference' && <span className="group-count">{finished}/{list.length}</span>}
            </summary>
            <ol>
              {list.map((c) => (
                <ChapterLink key={c.id} chapter={c} current={c.id === current} done={done.has(c.id)} />
              ))}
            </ol>
          </details>
        );
      })}
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
