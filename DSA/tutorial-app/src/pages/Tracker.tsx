import { useDeferredValue, useMemo, useState } from 'react';
import { CHAPTERS, findChapter } from '../chapters';
import { DifficultyBadge, StatusSelect } from '../components/ProblemSet';
import { TableWrap } from '../components/Content';
import { lookup, mustLookup, NON_DSA_TAGS, problemUrl, type Difficulty } from '../lib/leetcode';
import { STATUS_LABEL, useProblems, type Status } from '../lib/problems';
import { hrefFor } from '../lib/route';
import { PLACEMENTS, type PlacedProblem } from '../topics';

const ORDER = new Map(CHAPTERS.map((c, i) => [c.id, i]));
const GROUPS = [...new Set(CHAPTERS.filter((c) => c.kind === 'topic').map((c) => c.group))];
const DIFFS: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const PAGE = 150;

/** One row per problem number, placed in the first chapter that teaches it. */
function rows() {
  return [...PLACEMENTS.entries()]
    .map(([id, placed]) => {
      const sorted = [...placed].sort((a, b) => ORDER.get(a.topicId)! - ORDER.get(b.topicId)!);
      return { id, lc: mustLookup(id), placed: sorted, core: placed.some((p) => p.problem.core) };
    })
    .sort((a, b) => ORDER.get(a.placed[0].topicId)! - ORDER.get(b.placed[0].topicId)! || a.id - b.id);
}

/** Which chapters teach a LeetCode tag. */
function chaptersForTag(tag: string) {
  return CHAPTERS.filter((c) => c.tags.includes(tag));
}

export function Tracker() {
  const all = useMemo(rows, []);
  const { statusOf } = useProblems();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [diff, setDiff] = useState<'all' | Difficulty>('all');
  const [status, setStatus] = useState<'all' | Status>('all');
  const [coreOnly, setCoreOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  // Typing stays responsive while the long table catches up.
  const deferredQuery = useDeferredValue(query);

  const isDone = (id: number) => ['solved', 'mastered'].includes(statusOf(id));
  const q = deferredQuery.trim().toLowerCase().replace(/^#/, '');
  const filtered = all.filter(
    (r) =>
      (!q || String(r.id) === q || r.lc.title.toLowerCase().includes(q)) &&
      (group === 'all' || r.placed.some((p) => findChapter(p.topicId)?.group === group)) &&
      (diff === 'all' || r.lc.difficulty === diff) &&
      (status === 'all' || statusOf(r.id) === status) &&
      (!coreOnly || r.core),
  );

  const finderId = /^\d+$/.test(q) ? Number(q) : null;
  const finder = finderId !== null ? lookup(finderId) : undefined;

  return (
    <div className="tracker">
      <section className="stats" aria-label="Your progress">
        {DIFFS.map((d) => {
          const list = all.filter((r) => r.lc.difficulty === d);
          const n = list.filter((r) => isDone(r.id)).length;
          return (
            <div key={d} className="stat">
              <DifficultyBadge d={d} />
              <div className="stat-n">
                {n}<span>/{list.length}</span>
              </div>
              <div className="bar"><i style={{ width: `${list.length ? (n / list.length) * 100 : 0}%` }} /></div>
            </div>
          );
        })}
        <div className="stat">
          <span className="badge core">Core</span>
          <div className="stat-n">
            {all.filter((r) => r.core && isDone(r.id)).length}<span>/{all.filter((r) => r.core).length}</span>
          </div>
          <div className="bar"><i style={{ width: `${(all.filter((r) => r.core && isDone(r.id)).length / Math.max(1, all.filter((r) => r.core).length)) * 100}%` }} /></div>
        </div>
      </section>

      <div className="tracker-filters">
        <label className="field grow">
          <span>Find a problem</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Number or title, e.g. 42 or rain water" />
        </label>
        <label className="field">
          <span>Phase</span>
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="all">All phases</option>
            {GROUPS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Difficulty</span>
          <select value={diff} onChange={(e) => setDiff(e.target.value as 'all' | Difficulty)}>
            <option value="all">All</option>
            {DIFFS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | Status)}>
            <option value="all">All</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="chk">
          <input type="checkbox" checked={coreOnly} onChange={(e) => setCoreOnly(e.target.checked)} /> Core only
        </label>
      </div>

      {finderId !== null && <Finder id={finderId} inLab={PLACEMENTS.get(finderId)} found={finder !== undefined} />}

      <p className="tracker-count">
        {filtered.length} of {all.length} problems{filtered.length > limit ? `, showing the first ${limit}` : ''}
      </p>
      <TableWrap className="t tracker-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Problem</th>
            <th>Level</th>
            <th>Chapter · pattern</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, limit).map((r) => (
            <tr key={r.id}>
              <td className="mono">{r.id}</td>
              <td>
                <a href={problemUrl(r.lc.slug)} target="_blank" rel="noreferrer">{r.lc.title}</a>
                {r.core && <span className="badge core">Core</span>}
                {r.lc.premium && <span className="badge premium">Premium</span>}
              </td>
              <td><DifficultyBadge d={r.lc.difficulty} /></td>
              <td>
                {r.placed.map((p) => (
                  <a key={p.topicId} className="tracker-ch" href={hrefFor(p.topicId, `p-${r.id}`)}>
                    {findChapter(p.topicId)?.num} {findChapter(p.topicId)?.title} · {p.problem.pattern}
                  </a>
                ))}
              </td>
              <td><StatusSelect id={r.id} /></td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      {filtered.length > limit && (
        <button type="button" className="chip-btn reveal" onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, filtered.length - limit)} more
        </button>
      )}
    </div>
  );
}

/** For any LeetCode number: where the lab teaches it, or which chapters teach its techniques. */
function Finder({ id, inLab, found }: { id: number; inLab?: PlacedProblem[]; found: boolean }) {
  if (!found) {
    return (
      <div className="finder" role="status">
        <p>LeetCode problem {id} is not in the snapshot. It may be newer than the lab's problem list.</p>
      </div>
    );
  }
  const lc = mustLookup(id);
  const tags = lc.tags.filter((t) => !(NON_DSA_TAGS as readonly string[]).includes(t));
  return (
    <div className="finder" role="status" aria-label="Problem finder">
      <p className="finder-head">
        <span className="pnum">#{lc.id}</span>{' '}
        <a href={problemUrl(lc.slug)} target="_blank" rel="noreferrer">{lc.title}</a> <DifficultyBadge d={lc.difficulty} />
        {lc.premium && <span className="badge premium">Premium</span>}
      </p>
      {inLab ? (
        <p>
          It is in the lab:{' '}
          {inLab.map((p, i) => (
            <span key={p.topicId}>
              {i > 0 && ', '}
              <a href={hrefFor(p.topicId, `p-${id}`)}>{findChapter(p.topicId)?.title}</a> ({p.problem.pattern})
            </span>
          ))}
          .
        </p>
      ) : (
        <p>It is not one of the lab's problems, but these chapters teach the techniques LeetCode tags it with:</p>
      )}
      {tags.length > 0 ? (
        <ul className="finder-tags">
          {tags.map((t) => (
            <li key={t}>
              <b>{t}</b>{' → '}
              {chaptersForTag(t).map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ', '}
                  <a href={hrefFor(c.id)}>{c.num} {c.title}</a>
                </span>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p>LeetCode gives it no algorithm tags.</p>
      )}
    </div>
  );
}
