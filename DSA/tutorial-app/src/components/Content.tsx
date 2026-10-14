import { useId, useState, type ReactNode } from 'react';
import { CHAPTERS, findChapter } from '../chapters';
import { tagCount } from '../lib/leetcode';
import { hrefFor } from '../lib/route';
import { TOPICS } from '../topics';
import type { Signal } from '../topics/types';

type BoxKind = 'key' | 'try' | 'warn' | 'check' | 'tip' | 'practice' | 'recap';

export function Box({ kind, label, children }: { kind: BoxKind; label: string; children: ReactNode }) {
  return (
    <aside className={`box ${kind}`}>
      <span className="box-label">{label}</span>
      {children}
    </aside>
  );
}

export function Checkpoint({ question, children }: { question: ReactNode; children: ReactNode }) {
  return (
    <Box kind="check" label="Checkpoint">
      <p>{question}</p>
      <details className="answer">
        <summary>Show answer</summary>
        <div className="answer-body">{children}</div>
      </details>
    </Box>
  );
}

/** A link to another chapter by id, showing its number and title. Throws on an unknown id so tests catch typos. */
export function See({ id, children }: { id: string; children?: ReactNode }) {
  const ch = findChapter(id);
  if (!ch) throw new Error(`<See> refers to an unknown chapter: ${id}`);
  return (
    <a href={hrefFor(id)} className="see">
      {children ?? (
        <>
          {ch.title} <span className="see-n">({ch.num})</span>
        </>
      )}
    </a>
  );
}

/** The block under each topic chapter's title: what you will learn, what to read first, the LeetCode tags covered and the problem count. */
export function TopicIntro({ id, learn, before, time }: { id: string; learn: ReactNode[]; before?: string[]; time: string }) {
  const ch = findChapter(id);
  if (!ch) throw new Error(`<TopicIntro> refers to an unknown chapter: ${id}`);
  const problems = TOPICS[id]?.problems ?? [];
  const core = problems.filter((p) => p.core).length;
  return (
    <section className="intro" aria-label="Chapter overview">
      <div className="intro-col">
        <p className="intro-h">You will learn</p>
        <ul>
          {learn.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="intro-col">
        {before && before.length > 0 && (
          <>
            <p className="intro-h">Read first</p>
            <ul className="intro-before">
              {before.map((b) => (
                <li key={b}>
                  <See id={b} />
                </li>
              ))}
            </ul>
          </>
        )}
        {ch.tags.length > 0 && (
          <>
            <p className="intro-h">LeetCode tags covered</p>
            <ul className="tagchips" aria-label="LeetCode tags covered">
              {ch.tags.map((t) => (
                <li key={t}>
                  {t} <span className="tagcount">{tagCount(t)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="intro-meta">
        <span>Time: {time}</span>
        {problems.length > 0 && (
          <span>
            <a href={hrefFor(id, 'problems')}>{problems.length} problems</a> · {core} in the Core path
          </span>
        )}
      </p>
    </section>
  );
}

/** "When you see this, think that": the clues in a problem statement that point to this chapter's technique. */
export function Signals({ items }: { items: Signal[] }) {
  return (
    <TableWrap className="t signals">
      <thead>
        <tr>
          <th>When you see</th>
          <th>Think</th>
          <th>Why</th>
        </tr>
      </thead>
      <tbody>
        {items.map((s, i) => (
          <tr key={i}>
            <td>{s.see}</td>
            <td className="think">{s.think}</td>
            <td>{s.why}</td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

/** A technique written as plain-English steps, with why it works and what it costs. No code. */
export function Recipe({
  name, when, steps, why, time, space,
}: { name: string; when: ReactNode; steps: ReactNode[]; why?: ReactNode; time?: string; space?: string }) {
  return (
    <section className="recipe" aria-label={`Recipe: ${name}`}>
      <p className="recipe-kicker">Recipe</p>
      <h3 className="recipe-name">{name}</h3>
      <p className="recipe-when">
        <b>Use it when</b> {when}
      </p>
      <ol className="recipe-steps">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {why && (
        <p className="recipe-why">
          <b>Why it works</b> {why}
        </p>
      )}
      {(time || space) && (
        <p className="recipe-cost">
          {time && <span>Time {time}</span>}
          {space && <span>Space {space}</span>}
        </p>
      )}
    </section>
  );
}

export type Structure = { name: string; ts: ReactNode; ops: ReactNode; use: ReactNode };

/** Which data structure to reach for, what it is called in TypeScript, and what its operations cost. */
export function Structures({ items }: { items: Structure[] }) {
  return (
    <TableWrap className="t structures">
      <thead>
        <tr>
          <th>Structure</th>
          <th>In TypeScript</th>
          <th>Cost</th>
          <th>Use it for</th>
        </tr>
      </thead>
      <tbody>
        {items.map((s, i) => (
          <tr key={i}>
            <td><b>{s.name}</b></td>
            <td>{s.ts}</td>
            <td>{s.ops}</td>
            <td>{s.use}</td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

export type Question = { q: ReactNode; options: ReactNode[]; answer: number; why: ReactNode };

/** Multiple-choice questions that explain the answer once you pick one. */
export function Quiz({ questions, title = 'Check your understanding' }: { questions: Question[]; title?: string }) {
  return (
    <aside className="box check quiz">
      <span className="box-label">{title}</span>
      <ol className="quiz-list">
        {questions.map((q, i) => (
          <QuizItem key={i} q={q} />
        ))}
      </ol>
    </aside>
  );
}

function QuizItem({ q }: { q: Question }) {
  const name = useId();
  const [picked, setPicked] = useState<number | null>(null);
  if (q.answer < 0 || q.answer >= q.options.length) throw new Error('Quiz answer index is out of range');
  const right = picked === q.answer;
  return (
    <li>
      <fieldset className="quiz-q">
        <legend>{q.q}</legend>
        {q.options.map((opt, k) => {
          const cls = picked === null ? '' : k === q.answer ? ' is-right' : k === picked ? ' is-wrong' : '';
          return (
            <label key={k} className={`quiz-opt${cls}`}>
              <input type="radio" name={name} checked={picked === k} onChange={() => setPicked(k)} />
              <span>{opt}</span>
            </label>
          );
        })}
      </fieldset>
      {picked !== null && (
        <div className={right ? 'quiz-why right' : 'quiz-why wrong'} role="status">
          <b>{right ? 'Correct.' : 'Not quite.'}</b> {q.why}
        </div>
      )}
    </li>
  );
}

/** The points worth remembering, at the end of a chapter. */
export function Recap({ children }: { children: ReactNode }) {
  return (
    <Box kind="recap" label="Key takeaways">
      {children}
    </Box>
  );
}

/** Mistakes that cost people the most time on this topic. */
export function Pitfalls({ items }: { items: ReactNode[] }) {
  return (
    <Box kind="warn" label="Common mistakes">
      <ul>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </Box>
  );
}

export function TableWrap({ children, className = 't' }: { children: ReactNode; className?: string }) {
  return (
    <div className="table-wrap">
      <table className={className}>{children}</table>
    </div>
  );
}

/** A numbered step, for walking through how to think about a problem. */
export function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h3 className="step">
      <span className="step-n" aria-hidden="true">{n}</span>
      <span className="sr-only">Step {n}: </span>
      {children}
    </h3>
  );
}

type Exercise = { task: ReactNode; hint?: ReactNode; solution?: ReactNode };

/** Exercises to do on paper, each with an optional hint and answer behind a disclosure. */
export function Exercises({ items, label = 'Try it on paper' }: { items: Exercise[]; label?: string }) {
  return (
    <aside className="box practice">
      <span className="box-label">{label}</span>
      <ol className="exercises">
        {items.map((ex, i) => (
          <li key={i}>
            <div>{ex.task}</div>
            {ex.hint && (
              <details className="answer">
                <summary>Hint</summary>
                <div className="answer-body">{ex.hint}</div>
              </details>
            )}
            {ex.solution && (
              <details className="answer">
                <summary>Answer</summary>
                <div className="answer-body">{ex.solution}</div>
              </details>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** Big-O badge, e.g. <Cost>O(n log n)</Cost>. */
export function Cost({ children }: { children: ReactNode }) {
  return <span className="cost">{children}</span>;
}

/** Chapters in a group, as links: used by the welcome page and the study plan. */
export function ChapterList({ group }: { group: string }) {
  return (
    <ul className="chlist">
      {CHAPTERS.filter((c) => c.group === group).map((c) => (
        <li key={c.id}>
          <a href={hrefFor(c.id)}>
            <span className="chlist-n">{c.num}</span> {c.title}
          </a>
        </li>
      ))}
    </ul>
  );
}
