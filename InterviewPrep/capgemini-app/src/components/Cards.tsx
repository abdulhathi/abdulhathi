import { useState } from 'react';
import type { Problem, Question } from '../lib/md';
import { inlineHtml } from '../lib/markdown';
import { RATING_LABEL, useRatings, type Rating } from '../lib/ratings';
import { useAnchorTarget } from '../lib/route';
import { Markdown } from './Markdown';

export function Title({ text, as: Tag = 'h3', className }: { text: string; as?: 'h3' | 'h4' | 'p' | 'span'; className?: string }) {
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: inlineHtml(text) }} />;
}

export function RateButtons({ id }: { id: string }) {
  const { ratings, rate } = useRatings();
  const current = ratings[id];
  return (
    <div className="rate" role="group" aria-label="Rate yourself">
      {(Object.keys(RATING_LABEL) as Rating[]).map((r) => (
        <button key={r} type="button" className={`chip-btn rate-${r}${current === r ? ' on' : ''}`} aria-pressed={current === r} onClick={() => rate(id, r)}>
          {RATING_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

export function TagBadges({ tags }: { tags: string[] }) {
  return (
    <>
      {tags.includes('core') && <span className="badge core">Must know</span>}
      {tags.includes('deep') && <span className="badge deep">Follow-up</span>}
    </>
  );
}

/** A question with its model answer hidden until the reader has tried to answer out loud. */
export function QuestionCard({ chapterId, q, n, open: forced }: { chapterId: string; q: Question; n: number; open?: boolean }) {
  const { ref, targeted } = useAnchorTarget<HTMLElement>(q.id);
  const [shown, setShown] = useState(false);
  const open = forced || shown || targeted;
  return (
    <section id={q.id} ref={ref} className={targeted ? 'qcard targeted' : 'qcard'}>
      <div className="qcard-head">
        <span className="pnum">Q{n}</span>
        <Title text={q.title} className="qtitle" />
        <TagBadges tags={q.tags} />
      </div>
      {open ? (
        <div className="answer">
          <Markdown src={q.body} />
        </div>
      ) : null}
      <div className="pcard-actions">
        {!forced && (
          <button type="button" className="chip-btn reveal" aria-expanded={open} onClick={() => setShown((s) => !s)}>
            {open ? 'Hide answer' : 'Show answer'}
          </button>
        )}
        <RateButtons id={`${chapterId}/${q.id}`} />
      </div>
    </section>
  );
}

const LEVEL_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

/** A coding problem: the statement is open, hints come one at a time, then the solution. */
export function ProblemCard({ chapterId, p, n }: { chapterId: string; p: Problem; n: number }) {
  const { ref, targeted } = useAnchorTarget<HTMLElement>(p.id);
  const [hints, setHints] = useState(0);
  const [solved, setSolved] = useState(false);
  return (
    <section id={p.id} ref={ref} className={targeted ? 'qcard prob targeted' : 'qcard prob'}>
      <div className="qcard-head">
        <span className="pnum">P{n}</span>
        <Title text={p.title} className="qtitle" />
        <span className={`diff ${p.level}`}>{LEVEL_LABEL[p.level]}</span>
        <TagBadges tags={p.tags} />
      </div>
      <Markdown src={p.statement} className="md statement" />
      {hints > 0 && (
        <ol className="phints">
          {p.hints.slice(0, hints).map((h, i) => (
            <li key={i}>
              <span className="phint-n">Hint {i + 1}</span>
              <span dangerouslySetInnerHTML={{ __html: inlineHtml(h) }} />
            </li>
          ))}
        </ol>
      )}
      {solved && (
        <div className="solution">
          <p className="plabel">Solution</p>
          <Markdown src={p.solution} />
          {p.followUps && (
            <>
              <p className="plabel">Follow-ups the interviewer may ask</p>
              <Markdown src={p.followUps} />
            </>
          )}
        </div>
      )}
      <div className="pcard-actions">
        {hints < p.hints.length && !solved && (
          <button type="button" className="chip-btn" onClick={() => setHints((h) => h + 1)}>
            {hints === 0 ? 'Show a hint' : `Next hint (${hints + 1} of ${p.hints.length})`}
          </button>
        )}
        <button type="button" className="chip-btn reveal" aria-expanded={solved} onClick={() => setSolved((s) => !s)}>
          {solved ? 'Hide solution' : 'Show solution'}
        </button>
        <RateButtons id={`${chapterId}/${p.id}`} />
      </div>
    </section>
  );
}
