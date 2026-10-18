import { EXISTING_CREDENTIALS } from '../credentials';
import { usePathProgress } from '../lib/pathProgress';
import { useProgress } from '../lib/progress';
import { hrefFor } from '../lib/route';
import { useVoice } from '../lib/voice';
import { PATHS, projectFor, resourcesFor } from '../paths';
import { pathSteps } from './PathPage';

const KEYS = ['done', 'ratings', 'voice', 'voice-answers', 'voice-settings', 'paths', 'track'].map((k) => `interview-library.${k}`);

/** Everything you have earned across paths, in one place, plus a backup of your progress. */
export function ProfileKitPage() {
  const { all, state } = usePathProgress();
  const { done } = useProgress();
  const { results } = useVoice();

  const certificates = [
    ...EXISTING_CREDENTIALS.map((c) => ({ name: c.name, issuer: c.issuer, date: c.year, url: c.url, path: c.path ?? '', earlier: true })),
    ...PATHS.flatMap((p) => {
      const s = state(p.id);
      const r = resourcesFor(p.id);
      return [
        ...r.courses.filter((c) => s.courses[c.url]?.done).map((c) => ({ name: c.title, issuer: c.provider, date: s.courses[c.url]?.date ?? '', url: s.courses[c.url]?.url, path: p.id, earlier: false })),
        ...r.assessments.filter((a) => s.assessments[a.url]?.done).map((a) => ({ name: a.name, issuer: a.provider, date: s.assessments[a.url]?.date ?? '', url: s.assessments[a.url]?.url, path: p.id, earlier: false })),
      ];
    }),
  ];
  const projects = PATHS.flatMap((p) => {
    const repo = all[p.id]?.project?.repoUrl;
    return repo ? [{ path: p, repo, title: projectFor(p.id)?.title ?? p.title }] : [];
  });

  function exportProgress() {
    const data: Record<string, unknown> = {};
    for (const k of KEYS) {
      try {
        const v = localStorage.getItem(k);
        if (v !== null) data[k] = JSON.parse(v);
      } catch {
        /* skip unreadable keys */
      }
    }
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `interview-library-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importProgress(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as { data?: Record<string, unknown> };
      for (const [k, v] of Object.entries(parsed.data ?? {})) if (KEYS.includes(k)) localStorage.setItem(k, JSON.stringify(v));
      window.location.reload();
    } catch {
      alert('That file is not an Interview Library progress backup.');
    }
  }

  return (
    <div className="kit-page">
      <section className="ch-section">
        <h2>Learning paths</h2>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr><th>Path</th><th>Read</th><th>Voice</th><th>Course</th><th>Project</th><th>Assessment</th><th>Profile</th></tr>
            </thead>
            <tbody>
              {PATHS.map((p) => {
                const st = pathSteps(p, state(p.id), done, (k) => Boolean(results[k]?.passed));
                const cell = (x: { done: boolean; label: string }) => <td className={x.done ? 'yes' : undefined}>{x.done ? '✓' : x.label}</td>;
                return (
                  <tr key={p.id}>
                    <td><a href={hrefFor('path', p.id)}>{p.title}</a></td>
                    {cell(st.read)}
                    {cell(st.voice)}
                    {cell(st.course)}
                    {cell(st.project)}
                    {cell(st.assessment)}
                    {cell(st.profile)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ch-section">
        <h2>Certificates</h2>
        <ul className="res-list">
          {certificates.map((c, i) => (
            <li key={`${c.name}-${i}`}>
              <b>{c.name}</b> · {c.issuer}{c.date ? ` · ${c.date}` : ''}
              {c.url ? <> · <a href={c.url} target="_blank" rel="noreferrer">view ↗</a></> : c.earlier ? ' · (on your resume; add its link when you have it)' : ' · (add the certificate link on the path page)'}
            </li>
          ))}
        </ul>
      </section>

      <section className="ch-section">
        <h2>Portfolio projects</h2>
        {projects.length === 0 ? (
          <p className="md prose">No project repositories linked yet. Add one in step 4 of any learning path.</p>
        ) : (
          <ul className="res-list">
            {projects.map((x) => (
              <li key={x.path.id}>
                <b>{x.title}</b> · <a href={x.repo} target="_blank" rel="noreferrer">{x.repo} ↗</a> · <a href={hrefFor('path', x.path.id)}>{x.path.title} path</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ch-section">
        <h2>Back up your progress</h2>
        <p className="md prose">
          Your progress, scores, links and checklists live in this browser only. Download a backup now and then, and
          restore it on another browser or after clearing site data.
        </p>
        <div className="track-actions">
          <button type="button" className="chip-btn reveal" onClick={exportProgress}>Download backup</button>
          <label className="chip-btn">
            Restore from a backup
            <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void importProgress(e.target.files[0])} />
          </label>
        </div>
      </section>
    </div>
  );
}
