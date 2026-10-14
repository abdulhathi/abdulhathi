import { useState } from 'react';
import { mustLookup, problemUrl, type Difficulty } from '../lib/leetcode';
import { STATUS_LABEL, useProblems, type Status } from '../lib/problems';
import { useAnchorTarget } from '../lib/route';
import { TOPICS } from '../topics';
import type { Problem } from '../topics/types';

type DiffFilter = 'All' | Difficulty;
const DIFFS: DiffFilter[] = ['All', 'Easy', 'Medium', 'Hard'];

/**
 * The chapter's practice problems, grouped by pattern. Each card links to LeetCode and
 * reveals help one layer at a time: hints, then the key idea, then the full approach.
 */
export function ProblemSet({ id }: { id: string }) {
  const topic = TOPICS[id];
  if (!topic) throw new Error(`No topic data for chapter "${id}"`);
  const { statusOf } = useProblems();
  const [diff, setDiff] = useState<DiffFilter>('All');
  const [coreOnly, setCoreOnly] = useState(false);
  const [hideDone, setHideDone] = useState(false);

  const names = new Set(topic.patterns.map((p) => p.name));
  for (const p of topic.problems) {
    if (!names.has(p.pattern)) throw new Error(`Problem ${p.id} in "${id}" uses unknown pattern "${p.pattern}"`);
  }

  const visible = (p: Problem) =>
    (diff === 'All' || mustLookup(p.id).difficulty === diff) &&
    (!coreOnly || p.core) &&
    (!hideDone || !['solved', 'mastered'].includes(statusOf(p.id)));

  const total = topic.problems.length;
  const solved = topic.problems.filter((p) => ['solved', 'mastered'].includes(statusOf(p.id))).length;
  const count = (d: Difficulty) => topic.problems.filter((p) => mustLookup(p.id).difficulty === d).length;
  const shown = topic.problems.filter(visible).length;
  const { ref } = useAnchorTarget<HTMLElement>('problems');

  return (
    <section className="pset" id="problems" ref={ref} aria-label="Practice problems">
      <div className="pset-bar">
        <p className="pset-stats">
          <b>{total}</b> problems · <span className="diff easy">{count('Easy')} easy</span> <span className="diff medium">{count('Medium')} medium</span>{' '}
          <span className="diff hard">{count('Hard')} hard</span> · you solved <b>{solved}</b>
        </p>
        <div className="pset-filters" role="group" aria-label="Filter problems">
          <div className="seg" role="radiogroup" aria-label="Difficulty">
            {DIFFS.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={diff === d} className={diff === d ? 'on' : ''} onClick={() => setDiff(d)}>
                {d}
              </button>
            ))}
          </div>
          <label className="chk">
            <input type="checkbox" checked={coreOnly} onChange={(e) => setCoreOnly(e.target.checked)} /> Core only
          </label>
          <label className="chk">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide solved
          </label>
        </div>
      </div>
      {shown === 0 && <p className="pset-empty">No problems match these filters.</p>}
      {topic.patterns.map((pat) => {
        const list = topic.problems.filter((p) => p.pattern === pat.name && visible(p));
        if (list.length === 0) return null;
        return (
          <div key={pat.name} className="pset-group">
            <h3 className="pset-pattern">{pat.name}</h3>
            <p className="pset-idea">{pat.idea}</p>
            {list.map((p) => (
              <ProblemCard key={p.id} problem={p} />
            ))}
          </div>
        );
      })}
    </section>
  );
}

export function DifficultyBadge({ d }: { d: Difficulty }) {
  return <span className={`diff ${d.toLowerCase()}`}>{d}</span>;
}

export function StatusSelect({ id }: { id: number }) {
  const { statusOf, setStatus } = useProblems();
  const status = statusOf(id);
  return (
    <select className={`status s-${status}`} value={status} onChange={(e) => setStatus(id, e.target.value as Status)} aria-label={`Status of problem ${id}`}>
      {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

export function ProblemCard({ problem, context }: { problem: Problem; context?: string }) {
  const lc = mustLookup(problem.id);
  const [shown, setShown] = useState(0);
  const { ref, targeted } = useAnchorTarget<HTMLElement>(`p-${problem.id}`);
  const stages = problem.hints.length + 2; // every hint, then the key idea, then the approach
  const nextLabel =
    shown < problem.hints.length ? `Hint ${shown + 1} of ${problem.hints.length}` : shown === problem.hints.length ? 'Key idea' : 'Full approach';

  return (
    <article ref={ref} className={targeted ? 'pcard targeted' : 'pcard'} id={`p-${problem.id}`} aria-label={`Problem ${problem.id}: ${lc.title}`}>
      <header className="pcard-head">
        <span className="pnum">#{problem.id}</span>
        <a className="ptitle" href={problemUrl(lc.slug)} target="_blank" rel="noreferrer">
          {lc.title}
          <span aria-hidden="true"> ↗</span>
          <span className="sr-only"> (opens on LeetCode)</span>
        </a>
        <span className="pbadges">
          <DifficultyBadge d={lc.difficulty} />
          {problem.core && <span className="badge core" title="Core path: the must-do set">Core</span>}
          {lc.premium && <span className="badge premium" title="Needs a LeetCode Premium subscription">Premium</span>}
        </span>
        <StatusSelect id={problem.id} />
      </header>
      {context && <p className="pcontext">{context}</p>}
      <p className="psummary">{problem.summary}</p>

      {shown > 0 && (
        <ol className="phints">
          {problem.hints.slice(0, shown).map((h, i) => (
            <li key={i}>
              <span className="phint-n">Hint {i + 1}</span> {h}
            </li>
          ))}
        </ol>
      )}
      {shown > problem.hints.length && (
        <div className="pinsight">
          <span className="plabel">Key idea</span> {problem.insight}
        </div>
      )}
      {shown > problem.hints.length + 1 && (
        <div className="papproach">
          <span className="plabel">Approach</span>
          <ol>
            {problem.approach.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <dl className="pfacts">
            <div>
              <dt>Data structures</dt>
              <dd>
                {[...new Set(problem.ds)].map((d) => (
                  <span key={d} className="dschip">{d}</span>
                ))}
              </dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd className="mono">{problem.time}</dd>
            </div>
            <div>
              <dt>Space</dt>
              <dd className="mono">{problem.space}</dd>
            </div>
          </dl>
          {problem.traps && problem.traps.length > 0 && (
            <div className="ptraps">
              <span className="plabel warn">Watch out</span>
              <ul>
                {problem.traps.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="pcard-actions">
        {shown < stages && (
          <button type="button" className="chip-btn reveal" onClick={() => setShown(shown + 1)}>
            {nextLabel}
          </button>
        )}
        {shown < stages && (
          <button type="button" className="link-btn" onClick={() => setShown(stages)}>
            Show everything
          </button>
        )}
        {shown > 0 && (
          <button type="button" className="link-btn" onClick={() => setShown(0)}>
            Hide help
          </button>
        )}
      </div>
    </article>
  );
}
