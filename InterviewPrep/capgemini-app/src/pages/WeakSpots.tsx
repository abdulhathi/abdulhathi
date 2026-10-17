import { ALL_PROBLEMS, ALL_QUESTIONS, CHAPTERS } from '../chapters';
import { RateButtons, Title } from '../components/Cards';
import { useRatings } from '../lib/ratings';
import { hrefFor } from '../lib/route';

const GROUPS = [...new Set(CHAPTERS.filter((c) => c.group !== 'Start here').map((c) => c.group))];
const ITEMS = [
  ...ALL_QUESTIONS.map((x) => ({ key: x.key, chapter: x.chapter, id: x.q.id, title: x.q.title, core: x.q.tags.includes('core'), kind: 'Question' })),
  ...ALL_PROBLEMS.map((x) => ({ key: x.key, chapter: x.chapter, id: x.p.id, title: x.p.title, core: x.p.tags.includes('core'), kind: 'Problem' })),
];

export function WeakSpots() {
  const { ratings } = useRatings();
  const weak = ITEMS.filter((x) => ratings[x.key] === 'shaky' || ratings[x.key] === 'missed').sort(
    (a, b) => Number(ratings[b.key] === 'missed') - Number(ratings[a.key] === 'missed'),
  );

  return (
    <div className="weak">
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Topic</th>
              <th>Nailed</th>
              <th>Shaky</th>
              <th>Missed</th>
              <th>Must know, not rated</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => {
              const list = ITEMS.filter((x) => x.chapter.group === g);
              const n = (r: string) => list.filter((x) => ratings[x.key] === r).length;
              return (
                <tr key={g}>
                  <td>{g}</td>
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
