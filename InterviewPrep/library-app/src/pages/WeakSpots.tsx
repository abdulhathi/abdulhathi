import { useState } from 'react';
import { ALL_PROBLEMS, ALL_QUESTIONS, STACKS } from '../chapters';
import { RateButtons, Title, TopicLink } from '../components/Cards';
import { useRatings } from '../lib/ratings';
import { hrefFor } from '../lib/route';
import { scopesFor } from '../lib/scope';
import { useActiveTrack } from '../lib/track';

const ITEMS = [
  ...ALL_QUESTIONS.map((x) => ({ key: x.key, chapter: x.chapter, id: x.q.id, title: x.q.title, core: x.q.tags.includes('core'), kind: 'Question' })),
  ...ALL_PROBLEMS.map((x) => ({ key: x.key, chapter: x.chapter, id: x.p.id, title: x.p.title, core: x.p.tags.includes('core'), kind: 'Problem' })),
];

export function WeakSpots() {
  const { ratings } = useRatings();
  const { track } = useActiveTrack();
  const scopes = scopesFor(track).filter((s) => !s.id.startsWith('stack:'));
  const [scopeId, setScopeId] = useState(scopes[0].id);
  const scope = scopes.find((s) => s.id === scopeId) ?? scopes[0];
  const items = ITEMS.filter((x) => scope.includes(x.chapter));
  const rows = STACKS.map((s) => ({ title: s.title, list: items.filter((x) => x.chapter.stack === s.id) })).filter((r) => r.list.length > 0);
  const weak = items.filter((x) => ratings[x.key] === 'shaky' || ratings[x.key] === 'missed').sort(
    (a, b) => Number(ratings[b.key] === 'missed') - Number(ratings[a.key] === 'missed'),
  );

  return (
    <div className="weak">
      {scopes.length > 1 && (
        <div className="tracker-filters">
          <label className="field">
            <span>Cover</span>
            <select value={scope.id} onChange={(e) => setScopeId(e.target.value)}>
              {scopes.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Stack</th>
              <th>Nailed</th>
              <th>Shaky</th>
              <th>Missed</th>
              <th>Must know, not rated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ title, list }) => {
              const n = (r: string) => list.filter((x) => ratings[x.key] === r).length;
              return (
                <tr key={title}>
                  <td>{title}</td>
                  <td>{n('good')}</td>
                  <td>{n('shaky')}</td>
                  <td>{n('missed')}</td>
                  <td>{list.filter((x) => x.core && !ratings[x.key]).length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {weak.length === 0 ? (
        <p className="drill-empty">Nothing marked shaky or missed yet. Rate yourself in the chapters, the drill or a mock interview.</p>
      ) : (
        <ul className="review-list">
          {weak.map((x) => (
            <li key={x.key} className="review-item">
              <div className="review-main">
                <a href={hrefFor(x.chapter.id, x.id)} className="ptitle">
                  <Title text={x.title} as="span" />
                </a>
                <div className="review-ch">
                  <span>{x.kind}</span>
                  <span>{x.chapter.num} {x.chapter.title}</span>
                  {x.kind === 'Question' && <TopicLink chapterId={x.chapter.id} questionId={x.id} />}
                </div>
              </div>
              <RateButtons id={x.key} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
