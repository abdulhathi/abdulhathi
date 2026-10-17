import { ALL_PROBLEMS, ALL_QUESTIONS, CHAPTERS, PRACTICE_PAGES, type Chapter } from '../chapters';
import { useProgress } from '../lib/progress';
import { useRatings } from '../lib/ratings';
import { hrefFor } from '../lib/route';

const GROUPS = [...new Set(CHAPTERS.map((c) => c.group))];
const TOPICS = CHAPTERS.filter((c) => c.group !== 'Start here');

export function Sidebar({ current }: { current: string }) {
  const { done } = useProgress();
  const { ratings } = useRatings();
  const count = TOPICS.filter((c) => done.has(c.id)).length;
  const keys = [...ALL_QUESTIONS, ...ALL_PROBLEMS].map((x) => x.key);
  const rated = keys.filter((k) => ratings[k]).length;
  const weak = keys.filter((k) => ratings[k] === 'shaky' || ratings[k] === 'missed').length;
  const currentGroup = CHAPTERS.find((c) => c.id === current)?.group;

  const extra: Record<string, string> = { mock: '', drill: `${rated}/${keys.length}`, progress: weak ? String(weak) : '' };

  return (
    <nav className="toc" aria-label="Chapters">
      <div className="progress">
        <div className="progress-text">
          {count} of {TOPICS.length} chapters done
        </div>
        <div className="bar" role="progressbar" aria-label="Chapters done" aria-valuemin={0} aria-valuemax={TOPICS.length} aria-valuenow={count}>
          <i style={{ width: `${(count / TOPICS.length) * 100}%` }} />
        </div>
      </div>

      <p className="group">Practice</p>
      <ul className="toc-tools">
        {PRACTICE_PAGES.map((p) => (
          <li key={p.id}>
            <a href={hrefFor(p.id)} className={p.id === current ? 'toc-link is-current' : 'toc-link'} aria-current={p.id === current ? 'page' : undefined}>
              <span className="n">◆</span>
              <span>{p.title}</span>
              <span className={p.id === 'progress' && weak > 0 ? 'tick due' : 'tick'}>{extra[p.id]}</span>
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
              {group !== 'Start here' && <span className="group-count">{finished}/{list.length}</span>}
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
