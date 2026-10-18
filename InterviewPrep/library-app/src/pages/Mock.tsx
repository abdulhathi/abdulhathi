import { useEffect, useState } from 'react';
import { ALL_PROBLEMS, ALL_QUESTIONS } from '../chapters';
import { ProblemCard, QuestionCard } from '../components/Cards';
import { buildMock, type MockPlan } from '../lib/mock';
import { useActiveTrack } from '../lib/track';
import { TRACKS, type Track } from '../tracks';
import { RATING_LABEL, useRatings, type Rating } from '../lib/ratings';
import { hrefFor } from '../lib/route';
import { newSeed } from '../lib/random';
import { readJson, writeJson } from '../lib/storage';

const KEY = 'interview-library.mock';
type Saved = { plan: MockPlan; startedAt: number | null; finished: boolean };

const QUESTIONS = new Map(ALL_QUESTIONS.map((x) => [x.key, x]));
const PROBLEMS = new Map(ALL_PROBLEMS.map((x) => [x.key, x]));

function clock(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Mock() {
  const { track } = useActiveTrack();
  const [saved, setSaved] = useState<Saved | null>(() => readJson<Saved | null>(KEY, null));
  useEffect(() => writeJson(KEY, saved), [saved]);

  // Drop a saved round whose questions no longer exist (the chapters changed since), or that belongs to another track.
  const plan =
    saved && saved.plan.track === track?.id && saved.plan.items.every((i) => QUESTIONS.has(i.key) || PROBLEMS.has(i.key)) ? saved.plan : null;

  if (!track) return <PickTrack />;
  if (!saved || !plan) return <Setup key={track.id} track={track} onBuild={(p) => setSaved({ plan: p, startedAt: null, finished: false })} />;
  return <Round track={track} saved={saved} plan={plan} onChange={setSaved} />;
}

function PickTrack() {
  return (
    <div className="mock">
      <div className="box tip">
        <span className="box-label">Choose a track first</span>
        <p>A mock interview follows one job description: its topics, its coding language and its format. Pick one:</p>
        <ul>
          {TRACKS.map((t) => (
            <li key={t.id}>
              <a href={hrefFor('track', t.id)}>
                {t.company}: {t.role}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Setup({ track, onBuild }: { track: Track; onBuild: (plan: MockPlan) => void }) {
  const formats = Object.entries(track.mock.formats);
  const [format, setFormat] = useState(formats[0][0]);
  const [length, setLength] = useState(60);
  const [coreOnly, setCoreOnly] = useState(true);
  return (
      <div className="mock">
        <div className="box tip">
          <span className="box-label">{track.company} · how it works</span>
          <p>
            {track.mock.note} Answer every question out loud, write the code in a plain editor before you reveal anything,
            and rate yourself as you go.
          </p>
        </div>
        <fieldset className="mock-setup">
          <legend>Format</legend>
          {formats.map(([f, info]) => (
            <label key={f} className="chk">
              <input type="radio" name="format" checked={format === f} onChange={() => setFormat(f)} /> {info.label}
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
          onClick={() => onBuild(buildMock(track, format, length, newSeed(), coreOnly))}
        >
          Build my mock interview
        </button>
      </div>
  );
}

function Round({ track, saved, plan, onChange }: { track: Track; saved: Saved; plan: MockPlan; onChange: (s: Saved | null) => void }) {
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
          {track.company} · {track.mock.formats[plan.format]?.label ?? plan.format} · {plan.length} min · {questions.length} questions, {problems.length} coding {problems.length === 1 ? 'problem' : 'problems'}
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
            <QuestionCard chapterId={x.chapter.id} q={x.q} n={i + 1} elsewhere />
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
          {track.mock.closing} The <a href={hrefFor(track.start[2])}>stories chapter</a> has more.
        </p>
      </div>
    </div>
  );
}
