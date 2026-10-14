import { findChapter } from '../chapters';
import { DifficultyBadge } from '../components/ProblemSet';
import { mustLookup, problemUrl } from '../lib/leetcode';
import { addDays, dueIds, isoDay, REVIEW_DAYS, useProblems } from '../lib/problems';
import { hrefFor } from '../lib/route';
import { PLACEMENTS } from '../topics';

export function Review() {
  const { records, review } = useProblems();
  const today = isoDay();
  const due = dueIds(records, today).filter((id) => PLACEMENTS.has(id));
  const scheduled = Object.entries(records).filter(([, r]) => r.status === 'solved' && r.due && r.due > today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i + 1);
    return { day, n: scheduled.filter(([, r]) => r.due === day).length };
  });
  const mastered = Object.values(records).filter((r) => r.status === 'mastered').length;

  return (
    <div className="review">
      <div className="prose">
        <p>
          When you mark a problem <b>Solved</b>, it comes back here after {REVIEW_DAYS.join(', then ')} days. Each time, solve it again
          from a blank editor, without hints, in under 20 minutes. If you manage, it moves to the next gap; after the last one it
          counts as <b>Mastered</b>. If you needed help, it comes back tomorrow. Spacing reviews out like this is what moves a
          technique into long-term memory.
        </p>
      </div>

      <p className="review-sum">
        <b>{due.length}</b> due today · {scheduled.length} scheduled · {mastered} mastered
      </p>

      {due.length === 0 ? (
        <p className="review-empty">Nothing is due today. Solve new problems, or come back tomorrow.</p>
      ) : (
        <ol className="review-list">
          {due.map((id) => {
            const lc = mustLookup(id);
            const placed = PLACEMENTS.get(id)!;
            return (
              <li key={id} className="review-item">
                <div className="review-main">
                  <span className="pnum">#{id}</span>{' '}
                  <a href={problemUrl(lc.slug)} target="_blank" rel="noreferrer">{lc.title}</a> <DifficultyBadge d={lc.difficulty} />
                  <div className="review-ch">
                    {placed.map((p) => (
                      <a key={p.topicId} href={hrefFor(p.topicId, `p-${id}`)}>
                        {findChapter(p.topicId)?.title} · {p.problem.pattern}
                      </a>
                    ))}
                    <span className="review-due">due {records[id].due}</span>
                  </div>
                </div>
                <div className="review-actions">
                  <button type="button" className="chip-btn ok" onClick={() => review(id, true)}>I solved it again</button>
                  <button type="button" className="chip-btn" onClick={() => review(id, false)}>I needed help</button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <h2>Coming up</h2>
      <ul className="week" aria-label="Reviews in the next seven days">
        {week.map(({ day, n }) => (
          <li key={day}>
            <span className="week-day">{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</span>
            <span className="week-n">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
