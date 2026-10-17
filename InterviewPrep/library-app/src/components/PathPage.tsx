import type { ReactNode } from 'react';
import { findChapter } from '../chapters';
import { EXISTING_CREDENTIALS, PROFILE_SKILLS } from '../credentials';
import { questionsOf } from '../lib/md';
import { usePathProgress, type Earned, type PathState } from '../lib/pathProgress';
import { useProgress } from '../lib/progress';
import { hrefFor } from '../lib/route';
import { useVoice } from '../lib/voice';
import { projectFor, resourcesFor, type LearningPath } from '../paths';
import { CopyBlock } from './Copy';

export const PROJECT_CHECKS: [string, string][] = [
  ['repo', 'Public GitHub repository created'],
  ['milestones', 'All milestones in the brief done'],
  ['tests', 'Tests pass and GitHub Actions CI is green'],
  ['readme', 'README with architecture diagram, demo GIF and how to run'],
  ['demo', 'Live demo or short demo video linked from the README'],
];

export const PROFILE_CHECKS: [string, string][] = [
  ['li-skills', 'LinkedIn: skills added under Skills'],
  ['li-certs', 'LinkedIn: course and assessment certificates under Licenses & certifications'],
  ['li-project', 'LinkedIn: project under Projects, linked to the repo'],
  ['li-post', 'LinkedIn: post about what you built, pinned in Featured'],
  ['github', 'GitHub: repo pinned and listed in your profile README'],
  ['website', 'Website: skill and project added to abdulhathi.com'],
  ['resume', 'Resume: skill, certificate and project bullet added'],
];

/** Where each step stands, so the path page, home cards and profile kit agree. */
export function pathSteps(path: LearningPath, s: PathState, done: ReadonlySet<string>, passed: (key: string) => boolean) {
  const mustKnow = path.chapters.flatMap((id) => {
    const c = findChapter(id);
    return c ? questionsOf(c.doc).filter((q) => q.tags.includes('core')).map((q) => `${id}/${q.id}`) : [];
  });
  const existing = EXISTING_CREDENTIALS.filter((c) => c.path === path.id);
  const read = path.chapters.filter((id) => done.has(id)).length;
  const voice = mustKnow.filter(passed).length;
  return {
    read: { done: read === path.chapters.length, label: `${read}/${path.chapters.length} chapters` },
    voice: { done: mustKnow.length > 0 && voice === mustKnow.length, label: `${voice}/${mustKnow.length} must-know answers passed` },
    course: { done: Object.values(s.courses).some((c) => c.done), label: `${Object.values(s.courses).filter((c) => c.done).length} completed` },
    project: { done: Boolean(s.project.repoUrl) && PROJECT_CHECKS.every(([k]) => s.project.checks[k]), label: s.project.repoUrl ? 'repo linked' : 'not started' },
    assessment: {
      done: Object.values(s.assessments).some((a) => a.done) || existing.some((c) => c.url),
      label: `${Object.values(s.assessments).filter((a) => a.done).length + existing.filter((c) => c.url).length} earned`,
    },
    profile: { done: PROFILE_CHECKS.every(([k]) => s.profile[k]), label: `${PROFILE_CHECKS.filter(([k]) => s.profile[k]).length}/${PROFILE_CHECKS.length} done` },
  };
}

export function PathPage({ path }: { path: LearningPath }) {
  const { done } = useProgress();
  const { results } = useVoice();
  const { state, update } = usePathProgress();
  const s = state(path.id);
  const res = resourcesFor(path.id);
  const project = projectFor(path.id);
  const steps = pathSteps(path, s, done, (k) => Boolean(results[k]?.passed));
  const existing = EXISTING_CREDENTIALS.filter((c) => c.path === path.id);
  const setEarned = (kind: 'courses' | 'assessments', url: string, change: Partial<Earned>) =>
    update(path.id, (p) => ({ ...p, [kind]: { ...p[kind], [url]: { ...(p[kind][url] ?? { done: false }), ...change } } }));
  const allQuestions = path.chapters.reduce((n, id) => n + (findChapter(id) ? questionsOf(findChapter(id)!.doc).length : 0), 0);

  return (
    <div className="path-page">
      <p className="md prose">{path.blurb}</p>
      <ol className="path-steps">
        <Step n={1} title="Read the material" status={steps.read}>
          <ul className="plan-list">
            {path.chapters.map((id) => {
              const c = findChapter(id);
              return c ? (
                <li key={id} className={done.has(id) ? 'is-done' : undefined}>
                  <div className="plan-main">
                    <a href={hrefFor(id)}>{c.title}</a>
                    <span className="plan-meta">{c.group} · {c.minutes} min{done.has(id) ? ' · done ✓' : ''}</span>
                  </div>
                </li>
              ) : null;
            })}
          </ul>
          {path.lab && (
            <p className="step-note">
              Hands-on course in your portfolio: <a href={path.lab.url} target="_blank" rel="noreferrer">{path.lab.name} ↗</a>
            </p>
          )}
        </Step>

        <Step n={2} title="Answer the questions out loud" status={steps.voice}>
          <p className="step-note">
            The AI interviewer asks each question aloud, scores your spoken answer against the model answer, corrects your
            grammar, and does not move on until you pass. {allQuestions} questions in all; the must-know ones complete this step.
          </p>
          <a className="chip-btn reveal big" href={hrefFor('interview', path.id)}>🎤 Start the voice interview</a>
          {path.coding && (
            <p className="step-note">
              Hands-on coding practice:{' '}
              {path.coding.map((id, i) => (
                <span key={id}>
                  {i > 0 && ', '}
                  <a href={hrefFor(id)}>{findChapter(id)?.title ?? id}</a>
                </span>
              ))}
            </p>
          )}
        </Step>

        <Step n={3} title="Take a short course" status={steps.course}>
          {res.courses.length === 0 && <p className="step-note">Course suggestions are being researched.</p>}
          {res.courses.map((c) => {
            const e = s.courses[c.url];
            return (
              <div key={c.url} className="res-card">
                <p className="res-title">
                  <a href={c.url} target="_blank" rel="noreferrer">{c.title} ↗</a>
                </p>
                <p className="res-meta">{[c.provider, c.duration, c.level, c.updated].filter(Boolean).join(' · ')}</p>
                <p className="res-why">{c.why}</p>
                <EarnedRow
                  label="I completed it"
                  earned={e}
                  urlLabel="Certificate URL"
                  onChange={(change) => setEarned('courses', c.url, change)}
                />
              </div>
            );
          })}
          {res.portals.length > 0 && (
            <>
              <h4 className="step-sub">More practice questions</h4>
              <ul className="res-list">
                {res.portals.map((p) => (
                  <li key={p.url}>
                    <a href={p.url} target="_blank" rel="noreferrer">{p.name} ↗</a> · {p.what}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Step>

        <Step n={4} title="Build a GitHub portfolio project" status={steps.project}>
          {project ? (
            <>
              <p className="res-title">
                <a href={hrefFor('project', path.id)}>{project.title}</a>
              </p>
              <p className="res-why">{project.summary}{project.time ? ` · ${project.time}` : ''}</p>
            </>
          ) : (
            <p className="step-note">The project brief is being written.</p>
          )}
          <label className="field">
            <span>Repository URL</span>
            <input
              type="url"
              placeholder="https://github.com/abdulhathi/…"
              value={s.project.repoUrl ?? ''}
              onChange={(e) => update(path.id, (p) => ({ ...p, project: { ...p.project, repoUrl: e.target.value.trim() || undefined } }))}
            />
          </label>
          <Checklist items={PROJECT_CHECKS} values={s.project.checks} onToggle={(k, v) => update(path.id, (p) => ({ ...p, project: { ...p.project, checks: { ...p.project.checks, [k]: v } } }))} />
        </Step>

        <Step n={5} title="Earn an online assessment" status={steps.assessment}>
          {existing.map((c) => (
            <p key={c.name} className="step-note">
              Already earned: <b>{c.name}</b> ({c.issuer}, {c.year})
              {c.url && (
                <>
                  {' · '}
                  <a href={c.url} target="_blank" rel="noreferrer">view ↗</a>
                </>
              )}
            </p>
          ))}
          {res.assessments.length === 0 && <p className="step-note">Assessment suggestions are being researched.</p>}
          {res.assessments.map((a) => (
            <div key={a.url} className="res-card">
              <p className="res-title">
                <a href={a.url} target="_blank" rel="noreferrer">{a.name} ↗</a>
              </p>
              <p className="res-meta">{[a.provider, a.cost, a.format].filter(Boolean).join(' · ')}</p>
              <p className="res-why">{a.why} You get: {a.credential}</p>
              <EarnedRow label="I earned it" earned={s.assessments[a.url]} urlLabel="Credential URL" onChange={(change) => setEarned('assessments', a.url, change)} />
            </div>
          ))}
        </Step>

        <Step n={6} title="Add it to your profile, website and LinkedIn" status={steps.profile}>
          <ProfileKit path={path} s={s} />
          <Checklist items={PROFILE_CHECKS} values={s.profile} onToggle={(k, v) => update(path.id, (p) => ({ ...p, profile: { ...p.profile, [k]: v } }))} />
        </Step>
      </ol>
    </div>
  );
}

function Step({ n, title, status, children }: { n: number; title: string; status: { done: boolean; label: string }; children: ReactNode }) {
  return (
    <li className={status.done ? 'path-step is-done' : 'path-step'}>
      <h2 className="step-title">
        <span className="step-n" aria-hidden="true">{status.done ? '✓' : n}</span>
        <span>
          Step {n}: {title}
        </span>
        <span className="step-status">{status.done ? 'Done' : status.label}</span>
      </h2>
      <div className="step-body">{children}</div>
    </li>
  );
}

function Checklist({ items, values, onToggle }: { items: [string, string][]; values: Record<string, boolean>; onToggle: (k: string, v: boolean) => void }) {
  return (
    <ul className="checklist">
      {items.map(([k, label]) => (
        <li key={k}>
          <label className="chk">
            <input type="checkbox" checked={Boolean(values[k])} onChange={(e) => onToggle(k, e.target.checked)} /> {label}
          </label>
        </li>
      ))}
    </ul>
  );
}

function EarnedRow({ label, earned, urlLabel, onChange }: { label: string; earned?: Earned; urlLabel: string; onChange: (c: Partial<Earned>) => void }) {
  return (
    <div className="earned-row">
      <label className="chk">
        <input type="checkbox" checked={Boolean(earned?.done)} onChange={(e) => onChange({ done: e.target.checked, date: e.target.checked ? (earned?.date ?? new Date().toISOString().slice(0, 7)) : earned?.date })} /> {label}
      </label>
      {earned?.done && (
        <>
          <label className="field">
            <span>Month</span>
            <input type="month" value={earned.date ?? ''} onChange={(e) => onChange({ date: e.target.value })} />
          </label>
          <label className="field grow">
            <span>{urlLabel}</span>
            <input type="url" value={earned.url ?? ''} placeholder="https://…" onChange={(e) => onChange({ url: e.target.value.trim() || undefined })} />
          </label>
        </>
      )}
    </div>
  );
}

/** Markdown quote markers and code fences out, so the text pastes cleanly into LinkedIn. */
const plainText = (md: string) =>
  md
    .split('\n')
    .filter((l) => !/^```/.test(l))
    .map((l) => l.replace(/^>\s?/, ''))
    .join('\n')
    .trim();

const month = (d?: string) => (d ? new Date(`${d}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'the month you finished');

/** Ready-to-paste entries for LinkedIn, the GitHub profile README, the website and the resume. */
export function ProfileKit({ path, s }: { path: LearningPath; s: PathState }) {
  const res = resourcesFor(path.id);
  const project = projectFor(path.id);
  const skills = PROFILE_SKILLS[path.id] ?? [path.title];
  const courses = res.courses.filter((c) => s.courses[c.url]?.done);
  const assessments = res.assessments.filter((a) => s.assessments[a.url]?.done);
  const existing = EXISTING_CREDENTIALS.filter((c) => c.path === path.id);
  const repo = s.project.repoUrl;

  const certs = [
    ...courses.map((c) => ({ name: c.title, org: c.provider === 'LinkedIn Learning' ? 'LinkedIn' : c.provider, date: month(s.courses[c.url]?.date), url: s.courses[c.url]?.url ?? '' })),
    ...assessments.map((a) => ({ name: a.name, org: a.provider, date: month(s.assessments[a.url]?.date), url: s.assessments[a.url]?.url ?? '' })),
    ...existing.map((c) => ({ name: c.name, org: c.issuer, date: c.year, url: c.url ?? '' })),
  ];
  const certText = certs.length
    ? certs.map((c) => `Name: ${c.name}\nIssuing organization: ${c.org}\nIssue date: ${c.date}\nCredential URL: ${c.url || '(paste the certificate link)'}\nSkills: ${skills.join(', ')}`).join('\n\n')
    : 'Finish a course or an assessment in steps 3 and 5 and its entry appears here.';

  const projectText = project
    ? [
        `Name: ${project.title}`,
        `Description: ${project.summary}`,
        `Skills: ${skills.join(', ')}`,
        `Project URL: ${repo ?? '(add the repository URL in step 4)'}`,
        `Associated with: (leave empty, or your current role if you built it there)`,
      ].join('\n')
    : '';

  const readme = `- **[${project?.title ?? path.title}](${repo ?? 'https://github.com/abdulhathi/<repo>'})**: ${project?.summary ?? ''} \`${skills.slice(0, 3).join('` `')}\``;

  const website = JSON.stringify(
    {
      skill: path.title,
      keywords: skills,
      project: project ? { name: project.title, summary: project.summary, url: repo ?? '' } : undefined,
      certificates: certs.map((c) => ({ name: c.name, issuer: c.org, date: c.date, url: c.url })),
    },
    null,
    2,
  );

  const resumeBullet = plainText(project?.sections['Resume bullet'] ?? '').replace(/^[-*]\s*/, '');
  const resume = [
    `Skills line: add ${skills.join(', ')}`,
    certs.length ? `Certifications: ${certs.map((c) => `${c.name} (${c.org}, ${c.date})`).join('; ')}` : '',
    resumeBullet && repo ? `Projects: ${resumeBullet}` : 'Projects: add the bullet from the project brief once the repo is public.',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className="kit">
      <p className="step-note">
        Copy each entry into place. Only add what you have actually finished: certificates you hold, a project that is
        public, skills you can talk about in an interview.
      </p>
      <CopyBlock label="LinkedIn · Skills" text={skills.join('\n')} />
      <CopyBlock label="LinkedIn · Licenses & certifications" text={certText} />
      {projectText && <CopyBlock label="LinkedIn · Projects" text={projectText} />}
      {project?.sections['LinkedIn post template'] && (
        <CopyBlock label="LinkedIn · Post (then pin it in Featured)" text={plainText(project.sections['LinkedIn post template'])} />
      )}
      <CopyBlock label="GitHub profile README line" text={readme} />
      <CopyBlock label="Website (JSON for abdulhathi.com)" text={website} />
      <CopyBlock label="Resume" text={resume} />
    </div>
  );
}
