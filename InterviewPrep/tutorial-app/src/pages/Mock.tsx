import { useEffect, useState } from 'react';
import { ALL_PROBLEMS, ALL_QUESTIONS } from '../chapters';
import { ProblemCard, QuestionCard } from '../components/Cards';
import { buildMock, FORMATS, type Format, type MockPlan } from '../lib/mock';
import { RATING_LABEL, useRatings, type Rating } from '../lib/ratings';
import { hrefFor } from '../lib/route';
import { newSeed } from '../lib/random';
import { readJson, writeJson } from '../lib/storage';

const KEY = 'interview-lab.mock';
type Saved = { plan: MockPlan; startedAt: number | null; finished: boolean };

const QUESTIONS = new Map(ALL_QUESTIONS.map((x) => [x.key, x]));
const PROBLEMS = new Map(ALL_PROBLEMS.map((x) => [x.key, x]));

function clock(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Mock() {
  const [saved, setSaved] = useState<Saved | null>(() => readJson<Saved | null>(KEY, null));
  const [format, setFormat] = useState<Format>('coding');
  const [length, setLength] = useState(60);
  const [coreOnly, setCoreOnly] = useState(true);

  useEffect(() => writeJson(KEY, saved), [saved]);

  // Drop a saved round whose questions no longer exist (the chapters changed since).
  const plan = saved?.plan.items.every((i) => QUESTIONS.has(i.key) || PROBLEMS.has(i.key)) ? saved.plan : null;

  if (!saved || !plan) {
    return (
      <div className="mock">
        <div className="box tip">
          <span className="box-label">How it works</span>
          <p>
            The recruiter said the round is sometimes 30% coding and 60% technical questions, and sometimes 60% coding. Pick a
            format and a length. You get an opening question, technical questions spread across the JD's skills, then live
            coding problems. Answer every question out loud, write the code in a plain editor before you reveal anything, and
            rate yourself as you go.
          </p>
        </div>
        <fieldset className="mock-setup">
          <legend>Format</legend>
          {(Object.keys(FORMATS) as Format[]).map((f) => (
            <label key={f} className="chk">
              <input type="radio" name="format" checked={format === f} onChange={() => setFormat(f)} /> {FORMATS[f].label}
            </label>
          ))}
        </fieldset>
        <fieldset className="mock-setup">
          <legend>Length</legend>
          {[45, 60].map((m) => (
            <label key={m} className="chk">
              <input type="radio" name="length" checked={length === m} onChange={() => setLength(m)} /> {m} minutes
            </label>
          ))}
          <label className="chk">
            <input type="checkbox" checked={coreOnly} onChange={(e) => setCoreOnly(e.target.checked)} /> Must-know questions only
          </label>
        </fieldset>
        <button
          type="button"
          className="chip-btn reveal big"
          onClick={() => setSaved({ plan: buildMock(format, length, newSeed(), coreOnly), startedAt: null, finished: false })}
        >
          Build my mock interview
        </button>
      </div>
    );
  }

  return <Round saved={saved} plan={plan} onChange={setSaved} />;
}

function Round({ saved, plan, onChange }: { saved: Saved; plan: MockPlan; onChange: (s: Saved | null) => void }) {
  const { ratings } = useRatings();
  const [now, setNow] = useState(() => Date.now());
  const running = saved.startedAt !== null && !saved.finished;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const elapsed = saved.startedAt ? now - saved.startedAt : 0;
  const left = plan.length * 60_000 - elapsed;
  const questions = plan.items.filter((i) => i.kind === 'question');
  const problems = plan.items.filter((i) => i.kind === 'problem');
  const tally = (Object.keys(RATING_LABEL) as Rating[]).map((r) => [r, plan.items.filter((i) => ratings[i.key] === r).length] as const);

  return (
    <div className="mock">
      <div className="mock-bar">
        <p className="drill-score">
          {FORMATS[plan.format].label} · {plan.length} min · {questions.length} questions, {problems.length} coding problems
        </p>
        <div className="mock-actions">
          {saved.startedAt === null ? (
            <button type="button" className="chip-btn reveal" onClick={() => onChange({ ...saved, startedAt: Date.now() })}>Start the clock</button>
          ) : (
            <span className={left < 0 ? 'mock-clock over' : 'mock-clock'} role="timer" aria-live="off">
              {left >= 0 ? `${clock(left)} left` : `${clock(-left)} over`}
            </span>
          )}
          {running && (
            <button type="button" className="chip-btn" onClick={() => onChange({ ...saved, finished: true })}>Finish</button>
          )}
          <button type="button" className="chip-btn" onClick={() => onChange(null)}>New mock</button>
        </div>
      </div>

      {saved.finished && (
        <div className="box key">
          <span className="box-label">Your round</span>
          <p>
            Finished in {clock(elapsed)} of {plan.length}:00. {tally.map(([r, n]) => `${n} ${RATING_LABEL[r].toLowerCase()}`).join(', ')},{' '}
            {plan.items.length - tally.reduce((s, [, n]) => s + n, 0)} not rated.
          </p>
          <p>
            Re-study everything you marked shaky or missed on the <a href={hrefFor('progress')}>Weak spots</a> page, then build
            another mock.
          </p>
        </div>
      )}

      <h2>Technical questions <span className="mock-min">about {questions.reduce((s, i) => s + i.minutes, 0)} min</span></h2>
      {questions.map((item, i) => {
        const x = QUESTIONS.get(item.key)!;
        return (
          <div key={item.key} className="mock-item">
            <p className="mock-from">{x.chapter.title}</p>
            <QuestionCard chapterId={x.chapter.id} q={x.q} n={i + 1} />
          </div>
        );
      })}

      <h2>Live coding <span className="mock-min">about {problems.reduce((s, i) => s + i.minutes, 0)} min</span></h2>
      <p className="mock-note">
        Write each solution in a plain editor or on paper first. Talk through the brute force, then the better idea, then
        test with an example and an edge case before you reveal anything.
      </p>
      {problems.map((item, i) => {
        const x = PROBLEMS.get(item.key)!;
        return (
          <div key={item.key} className="mock-item">
            <p className="mock-from">{x.chapter.title} · aim for {item.minutes} min</p>
            <ProblemCard chapterId={x.chapter.id} p={x.p} n={i + 1} />
          </div>
        );
      })}

      <div className="box tip">
        <span className="box-label">Last 5 minutes</span>
        <p>
          Ask your questions: how much of the work is model building and how much is full-stack Python and React, who the end
          client and team are, and what the first 90 days look like. The <a href={hrefFor('stories')}>stories chapter</a> has more.
        </p>
      </div>
    </div>
  );
}
