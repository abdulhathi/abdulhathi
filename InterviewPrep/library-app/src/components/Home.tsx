import { ALL_PROBLEMS, ALL_QUESTIONS, findChapter, LIBRARY, STACKS, TESTED_BLOCKS } from '../chapters';
import { usePathProgress } from '../lib/pathProgress';
import { useProgress } from '../lib/progress';
import { useVoice } from '../lib/voice';
import { PATHS } from '../paths';
import { pathSteps } from './PathPage';
import { hrefFor } from '../lib/route';
import { useActiveTrack } from '../lib/track';
import { PRIORITY_LABEL, TRACKS, type Priority } from '../tracks';

const PRIORITIES: Priority[] = ['must', 'review', 'optional'];

/** The library home: your tracks (one per job description) and every tech stack. */
export function Home() {
  const { done } = useProgress();
  const { track: active } = useActiveTrack();
  const { results } = useVoice();
  const { state } = usePathProgress();
  const core = ALL_QUESTIONS.filter((x) => x.q.tags.includes('core') && x.chapter.kind !== 'track').length;
  return (
    <>
      <header className="hero">
        <p className="kicker">Interview Library</p>
        <h1>One library, every interview</h1>
        <p className="lede">
          Every topic is written once and organised by tech stack. Each job description is a track that picks the chapters
          it needs and says how much each one matters, so what you study for one interview counts for the next.
        </p>
        <dl className="facts">
          <div><dt>Library</dt><dd>{LIBRARY.length} chapters in {STACKS.length} stacks</dd></div>
          <div><dt>Interview questions</dt><dd>{ALL_QUESTIONS.length}, of which {core} are must know</dd></div>
          <div><dt>Coding problems</dt><dd>{ALL_PROBLEMS.length}, with hints and tested solutions</dd></div>
          <div><dt>Code checked</dt><dd>{TESTED_BLOCKS} blocks run or type-checked</dd></div>
        </dl>
      </header>

      <section className="home-section" aria-labelledby="paths-h">
        <h2 id="paths-h">Learning paths</h2>
        <p className="home-note">
          One per technology, in six steps: read, answer out loud with an AI interviewer, take a short course, build a
          GitHub project, earn an assessment, then add it to LinkedIn, GitHub and your website.
        </p>
        <div className="cards">
          {PATHS.map((p) => {
            const st = pathSteps(p, state(p.id), done, (k) => Boolean(results[k]?.passed));
            const steps = [st.read, st.voice, st.course, st.project, st.assessment, st.profile];
            const finished = steps.filter((x) => x.done).length;
            return (
              <article key={p.id} className="card">
                <h3>
                  <a href={hrefFor('path', p.id)}>{p.title}</a>
                </h3>
                <p className="card-desc">{p.blurb}</p>
                <ol className="mini-steps" aria-label={`${finished} of 6 steps done`}>
                  {steps.map((x, i) => (
                    <li key={i} className={x.done ? 'is-done' : undefined} title={x.label}>{i + 1}</li>
                  ))}
                </ol>
                <a className="chip-btn reveal" href={hrefFor('path', p.id)}>{finished ? 'Continue' : 'Start this path'}</a>
              </article>
            );
          })}
        </div>
      </section>

      <section className="home-section" aria-labelledby="tracks-h">
        <h2 id="tracks-h">Your tracks</h2>
        <p className="home-note">Pick the interview you are preparing for. Your progress and ratings are shared by every track.</p>
        <div className="cards">
          {TRACKS.map((t) => {
            const planned = t.plan.map(([id]) => id);
            const finished = planned.filter((id) => done.has(id)).length;
            return (
              <article key={t.id} className={t.id === active?.id ? 'card is-active' : 'card'}>
                <p className="card-kicker">{t.status}</p>
                <h3>
                  <a href={hrefFor('track', t.id)}>{t.company}</a>
                </h3>
                <p className="card-role">{t.role}</p>
                <p className="card-desc">{t.context}</p>
                <p className="card-meta">
                  {PRIORITIES.map((p) => `${t.plan.filter(([, x]) => x === p).length} ${PRIORITY_LABEL[p].toLowerCase()}`).join(' · ')}
                </p>
                <div className="bar" role="progressbar" aria-label={`${t.company} chapters done`} aria-valuemin={0} aria-valuemax={planned.length} aria-valuenow={finished}>
                  <i style={{ width: `${(finished / planned.length) * 100}%` }} />
                </div>
                <p className="card-meta">{finished} of {planned.length} chapters done</p>
                <a className="chip-btn reveal" href={hrefFor('track', t.id)}>
                  {t.id === active?.id ? 'Continue this track' : 'Open this track'}
                </a>
              </article>
            );
          })}
        </div>
      </section>

      <section className="home-section" aria-labelledby="stacks-h">
        <h2 id="stacks-h">Browse by tech stack</h2>
        <div className="cards">
          {STACKS.map((s) => (
            <article key={s.id} className="card">
              <h3>{s.title}</h3>
              <p className="card-desc">{s.blurb}</p>
              <p className="card-meta">
                {s.chapters.filter((id) => done.has(id)).length} of {s.chapters.length} done
              </p>
              <ul className="card-links">
                {s.chapters.map((id) => (
                  <li key={id}>
                    <a href={hrefFor(id)}>{findChapter(id)?.title ?? id}</a>
                    {done.has(id) && <span className="tick" aria-label="done"> ✓</span>}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <div className="box tip">
        <span className="box-label">A new job description?</span>
        <p>
          Add it as a new track: list the library chapters it needs with a priority and a reason, and write its three
          own chapters (study plan, coding round, stories). New chapters are only needed for stacks the library does not
          cover yet. The format is in <code>src/tracks.ts</code>.
        </p>
      </div>
    </>
  );
}
