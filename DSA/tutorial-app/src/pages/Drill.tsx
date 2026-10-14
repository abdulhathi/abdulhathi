import { useMemo, useState } from 'react';
import { CHAPTERS, findChapter, type Chapter } from '../chapters';
import { DifficultyBadge } from '../components/ProblemSet';
import { mustLookup, problemUrl } from '../lib/leetcode';
import { useProgress } from '../lib/progress';
import { hrefFor } from '../lib/route';
import { PLACED, PLACEMENTS, type PlacedProblem } from '../topics';

const TOPIC_CHAPTERS = CHAPTERS.filter((c) => c.kind === 'topic');
const GROUPS = [...new Set(TOPIC_CHAPTERS.map((c) => c.group))];

type Scope = 'all' | 'done' | string; // a group name

function shuffle<T>(list: T[], random: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Three wrong answers that are clearly wrong: chapters that teach the problem are
 * excluded, and so are chapters that teach any LeetCode tag the problem carries.
 */
export function pickOptions(item: PlacedProblem, random: () => number = Math.random): Chapter[] {
  const right = new Set((PLACEMENTS.get(item.problem.id) ?? []).map((p) => p.topicId));
  const tags = new Set(mustLookup(item.problem.id).tags);
  const wrong = TOPIC_CHAPTERS.filter((c) => !right.has(c.id) && !c.tags.some((t) => tags.has(t)) && c.id !== item.topicId);
  const answer = findChapter(item.topicId)!;
  return shuffle([answer, ...shuffle(wrong, random).slice(0, 3)], random);
}

export function Drill({ random = Math.random }: { random?: () => number }) {
  const { done } = useProgress();
  const [scope, setScope] = useState<Scope>('all');
  const pool = useMemo(
    () =>
      PLACED.filter((p) => {
        const ch = findChapter(p.topicId);
        if (!ch) return false;
        if (scope === 'all') return true;
        if (scope === 'done') return done.has(ch.id);
        return ch.group === scope;
      }),
    [scope, done],
  );
  const [seed, setSeed] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });

  // A new question each time the seed or the pool changes.
  const item = useMemo(() => (pool.length ? pool[Math.floor(random() * pool.length)] : undefined), [pool, seed, random]);
  const options = useMemo(() => (item ? pickOptions(item, random) : []), [item, random]);

  const rightIds = new Set(item ? (PLACEMENTS.get(item.problem.id) ?? []).map((p) => p.topicId) : []);
  const choose = (id: string) => {
    if (picked) return;
    setPicked(id);
    setScore((s) => ({ right: s.right + (rightIds.has(id) ? 1 : 0), total: s.total + 1 }));
  };
  const next = () => {
    setPicked(null);
    setSeed((s) => s + 1);
  };

  return (
    <div className="drill">
      <div className="prose">
        <p>
          Real interviews never tell you the topic. Read the problem below and pick the technique you would reach for. Answer first,
          then compare your thinking with the key idea. Ten a day trains the recognition that makes problems feel familiar.
        </p>
      </div>
      <div className="drill-bar">
        <label className="field">
          <span>Questions from</span>
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setPicked(null);
            }}
          >
            <option value="all">Every chapter</option>
            <option value="done">Chapters I have finished</option>
            {GROUPS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <p className="drill-score" aria-live="polite">
          Score: <b>{score.right}</b> / {score.total}
        </p>
      </div>

      {!item ? (
        <p className="drill-empty">
          {scope === 'done' ? 'Mark a chapter as finished to drill its problems.' : 'No problems here yet.'}
        </p>
      ) : (
        <section className="drill-card" aria-label="Drill question">
          <p className="drill-q">Which technique solves this?</p>
          <p className="drill-summary">{item.problem.summary}</p>
          <div className="drill-options" role="group" aria-label="Choose a technique">
            {options.map((c) => {
              const state = !picked ? '' : rightIds.has(c.id) ? ' is-right' : c.id === picked ? ' is-wrong' : '';
              return (
                <button key={c.id} type="button" className={`drill-opt${state}`} onClick={() => choose(c.id)} disabled={picked !== null}>
                  {c.title}
                </button>
              );
            })}
          </div>
          {picked && (
            <div className={rightIds.has(picked) ? 'drill-result right' : 'drill-result wrong'} role="status">
              <p>
                <b>{rightIds.has(picked) ? 'Yes.' : 'Not this time.'}</b> It is{' '}
                <a href={problemUrl(mustLookup(item.problem.id).slug)} target="_blank" rel="noreferrer">
                  #{item.problem.id} {mustLookup(item.problem.id).title}
                </a>{' '}
                <DifficultyBadge d={mustLookup(item.problem.id).difficulty} />, taught in{' '}
                <a href={hrefFor(item.topicId, `p-${item.problem.id}`)}>{findChapter(item.topicId)?.title}</a> as{' '}
                <i>{item.problem.pattern}</i>.
              </p>
              <p>
                <b>Key idea:</b> {item.problem.insight}
              </p>
              <button type="button" className="chip-btn reveal" onClick={next} autoFocus>
                Next problem →
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
