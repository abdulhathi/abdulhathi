import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { findChapter } from '../chapters';
import { LANGUAGE_LABEL, loadExercise, markSolved, readDraft, readSolved, reviewCode, runCode, writeDraft, type Exercise, type Review, type RunResult, type Solved, type Table } from '../lib/code';
import { inlineHtml } from '../lib/markdown';
import { problemsOf } from '../lib/md';
import { useRatings } from '../lib/ratings';
import { readJson, writeJson } from '../lib/storage';
import { hrefFor } from '../lib/route';
import { useVoice } from '../lib/voice';
import { MODEL_LABEL } from '../lib/evaluate';
import { CodeEditor } from './CodeEditor';
import { Markdown } from './Markdown';
import { Title } from './Cards';

const FONT_KEY = 'interview-library.code-font';
const LAYOUT_KEY = 'interview-library.code-layout';
/** Where the editor sits relative to the problem. */
const LAYOUTS = ['right', 'left', 'bottom', 'top'] as const;
type Layout = (typeof LAYOUTS)[number];
const readLayout = (): Layout => {
  const v = readJson<string>(LAYOUT_KEY, 'right');
  return (LAYOUTS as readonly string[]).includes(v) ? (v as Layout) : 'right';
};
const FONT_MIN = 11;
const FONT_MAX = 26;
const clampFont = (n: number) => Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n)));

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const solvedNote = (s: Solved | undefined) =>
  !s ? '' : `${s.ms ? ` in ${clock(s.ms)}` : ''}${s.runs ? `, after ${s.runs} run${s.runs === 1 ? '' : 's'}` : ''}`;

/** A LeetCode-style page: the problem on the left, an editor with Run and Run tests on the right. */
export function CodePage({ chapterId, problemId }: { chapterId: string; problemId: string }) {
  const chapter = findChapter(chapterId);
  const problems = chapter ? problemsOf(chapter.doc) : [];
  const index = problems.findIndex((p) => p.id === problemId);
  const problem = problems[index];
  const key = `${chapterId}/${problemId}`;
  const [exercise, setExercise] = useState<Exercise | null | undefined>(undefined);
  const [layout, setLayout] = useState<Layout>(readLayout);
  const chooseLayout = (l: Layout) => {
    setLayout(l);
    writeJson(LAYOUT_KEY, l);
  };

  useEffect(() => {
    let live = true;
    setExercise(undefined);
    void loadExercise(chapterId, problemId).then((e) => live && setExercise(e ?? null));
    return () => {
      live = false;
    };
  }, [chapterId, problemId]);

  if (!chapter || !problem) return <p className="md prose">There is no coding problem “{problemId}” in “{chapterId}”.</p>;
  const prev = problems[index - 1];
  const next = problems[index + 1];

  return (
    <div className="code-page">
      <div className="code-nav">
        <a href={hrefFor(chapterId, problemId)} className="chip-btn">← {chapter.title}</a>
        <span className="code-pos">Problem {index + 1} of {problems.length}</span>
        {prev && <a className="chip-btn" href={hrefFor('code', `${chapterId}/${prev.id}`)}>← Previous</a>}
        {next && <a className="chip-btn" href={hrefFor('code', `${chapterId}/${next.id}`)}>Next →</a>}
        {exercise && (
          <span className="ws-layout">
            <span className="ws-layout-label" id="ws-layout-label">Editor</span>
            <span className="seg" role="group" aria-labelledby="ws-layout-label">
              {LAYOUTS.map((l) => (
                <button key={l} type="button" className={l === layout ? 'on' : undefined} aria-pressed={l === layout} onClick={() => chooseLayout(l)} title={`Put the editor ${l === 'right' || l === 'left' ? `on the ${l}` : `at the ${l}`}`}>
                  {l[0].toUpperCase() + l.slice(1)}
                </button>
              ))}
            </span>
          </span>
        )}
      </div>
      {exercise === undefined ? (
        <p className="md prose">Loading the editor…</p>
      ) : exercise === null ? (
        <p className="md prose">This problem has no runnable exercise yet. Solve it on the chapter page with the hints and the solution.</p>
      ) : (
        <Workspace key={key} chapterId={chapterId} problem={problem} exercise={exercise} layout={layout} />
      )}
    </div>
  );
}

function Workspace({ chapterId, problem, exercise, layout }: { chapterId: string; problem: ReturnType<typeof problemsOf>[number]; exercise: Exercise; layout: Layout }) {
  const key = `${chapterId}/${problem.id}`;
  const { setRating } = useRatings();
  const { settings } = useVoice();
  const [code, setCode] = useState(() => readDraft(key) ?? exercise.starter);
  const [result, setResult] = useState<RunResult | null>(null);
  const [lastMode, setLastMode] = useState<'run' | 'test'>('test');
  const [busy, setBusy] = useState<'run' | 'test' | 'review' | null>(null);
  const [error, setError] = useState('');
  const [hints, setHints] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [solved, setSolved] = useState(() => Boolean(readSolved()[key]));
  const started = useRef<number | null>(null);
  const runs = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [fontSize, setFontSize] = useState(() => clampFont(Number(readJson(FONT_KEY, 14)) || 14));
  const changeFont = (delta: number) =>
    setFontSize((f) => {
      const next = clampFont(f + delta);
      writeJson(FONT_KEY, next);
      return next;
    });

  // Save the draft as you type (debounced), and run a clock from your first edit.
  useEffect(() => {
    const t = setTimeout(() => writeDraft(key, code === exercise.starter ? undefined : code), 400);
    return () => clearTimeout(t);
  }, [code, key, exercise.starter]);
  useEffect(() => {
    if (solved) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [solved]);

  // Runs read the latest text from a ref, so a shortcut pressed right after typing never sends stale code.
  const latest = useRef(code);
  const onChange = useCallback((v: string) => {
    started.current ??= Date.now();
    latest.current = v;
    setCode(v);
  }, []);

  const execute = useCallback(
    async (mode: 'run' | 'test') => {
      setBusy(mode);
      setError('');
      setLastMode(mode);
      runs.current++;
      const r = await runCode(chapterId, problem.id, latest.current, mode);
      setBusy(null);
      if (!r.ok) {
        setError(r.error);
        setResult(null);
        return;
      }
      setResult(r.data);
      if (mode === 'test' && r.data.ok && !solved) {
        setSolved(true);
        setRating(key, 'good');
        markSolved(key, { at: Date.now(), ms: started.current ? Date.now() - started.current : undefined, runs: runs.current });
      }
    },
    [chapterId, problem.id, key, setRating, solved],
  );

  async function askReview() {
    setBusy('review');
    setError('');
    const tests = result?.tests ? `${result.tests.passed} of ${result.tests.total} tests passed${result.tests.failures[0] ? `; first failure: ${result.tests.failures[0].code} ${result.tests.failures[0].message ?? ''}` : ''}` : result?.error ? `error: ${result.error.slice(0, 300)}` : undefined;
    const r = await reviewCode({ chapterId, problemId: problem.id, code: latest.current, language: exercise.language, tests, model: settings.model });
    setBusy(null);
    if (r.ok) setReview(r.data);
    else setError(r.error);
  }

  function reset() {
    if (code !== exercise.starter && !window.confirm('Replace your code with the starter code?')) return;
    latest.current = exercise.starter;
    setCode(exercise.starter);
    setResult(null);
    setReview(null);
  }

  const elapsed = started.current ? (solved ? null : now - started.current) : null;
  const canRunTests = exercise.mode !== 'typecheck' || exercise.language === 'tsx' || exercise.language === 'ts';
  const testLabel = exercise.mode === 'typecheck' ? 'Check types' : exercise.mode === 'rows' ? 'Check result' : 'Run tests';

  return (
    <div className={`workspace layout-${layout}`} style={{ '--code-font': `${fontSize}px` } as CSSProperties}>
      <section className="ws-problem" aria-label="Problem">
        <div className="qcard-head">
          <Title text={problem.title} className="qtitle" />
          <span className={`diff ${problem.level}`}>{problem.level}</span>
          {solved && <span className="badge core">Solved</span>}
        </div>
        <Markdown src={problem.statement} className="md statement" />
        {exercise.setup && (
          <details className="ws-given">
            <summary>Tables and data</summary>
            <CodeEditor fontSize={fontSize} value={exercise.setup} language={exercise.language} readOnly label="Tables and data" minHeight={120} />
          </details>
        )}
        {hints > 0 && (
          <ol className="phints">
            {problem.hints.slice(0, hints).map((h, i) => (
              <li key={i}>
                <span className="phint-n">Hint {i + 1}</span>
                <span dangerouslySetInnerHTML={{ __html: inlineHtml(h) }} />
              </li>
            ))}
          </ol>
        )}
        <div className="pcard-actions">
          {hints < problem.hints.length && (
            <button type="button" className="chip-btn" onClick={() => setHints((h) => h + 1)}>
              {hints === 0 ? 'Show a hint' : `Next hint (${hints + 1} of ${problem.hints.length})`}
            </button>
          )}
          {!showSolution && (
            <button
              type="button"
              className="chip-btn"
              onClick={() => (solved || window.confirm('Show the model solution? Try the hints first: you learn more by finishing it yourself.')) && setShowSolution(true)}
            >
              {solved ? 'Compare with the model solution' : 'Show the solution'}
            </button>
          )}
        </div>
        {showSolution && (
          <div className="solution">
            <p className="plabel">Model solution</p>
            <Markdown src={problem.solution} />
            {problem.followUps && (
              <>
                <p className="plabel">Follow-ups the interviewer may ask</p>
                <Markdown src={problem.followUps} />
              </>
            )}
          </div>
        )}
        {exercise.tests && (
          <details className="ws-given">
            <summary>The tests your code must pass</summary>
            <CodeEditor fontSize={fontSize} value={exercise.tests} language={exercise.language} readOnly label="Tests" minHeight={120} />
          </details>
        )}
      </section>

      <section className="ws-code" aria-label="Your code">
        <div className="ws-toolbar">
          <span className="ws-lang">{LANGUAGE_LABEL[exercise.language]}</span>
          {elapsed !== null && <span className="ws-clock" title="Time since your first edit">{clock(elapsed)}</span>}
          <span className="ws-font" role="group" aria-label="Code font size">
            <button type="button" className="chip-btn" onClick={() => changeFont(-1)} disabled={fontSize <= FONT_MIN} aria-label="Smaller code font" title="Smaller code font">
              A−
            </button>
            <span className="ws-font-size" aria-live="polite">{fontSize}px</span>
            <button type="button" className="chip-btn" onClick={() => changeFont(1)} disabled={fontSize >= FONT_MAX} aria-label="Larger code font" title="Larger code font">
              A+
            </button>
          </span>
          <span className="ws-spacer" />
          {exercise.mode !== 'typecheck' && (
            <button type="button" className="chip-btn" onClick={() => void execute('run')} disabled={busy !== null} title="Run your code (⌘/Ctrl + Enter)">
              {busy === 'run' ? 'Running…' : '▶ Run'}
            </button>
          )}
          {canRunTests && (
            <button type="button" className="chip-btn reveal" onClick={() => void execute('test')} disabled={busy !== null} title={`${testLabel} (⌘/Ctrl + Shift + Enter)`}>
              {busy === 'test' ? 'Checking…' : `✓ ${testLabel}`}
            </button>
          )}
          <button type="button" className="chip-btn" onClick={() => void askReview()} disabled={busy !== null} title={`Interviewer-style review by ${MODEL_LABEL[settings.model] ?? settings.model}`}>
            {busy === 'review' ? 'Reviewing…' : 'Code review'}
          </button>
          <button type="button" className="chip-btn" onClick={reset} disabled={busy !== null}>Reset</button>
        </div>
        {exercise.prelude && (
          <details className="ws-given">
            <summary>Given code (already defined for you)</summary>
            <CodeEditor fontSize={fontSize} value={exercise.prelude} language={exercise.language} readOnly label="Given code" minHeight={80} />
          </details>
        )}
        <CodeEditor
          fontSize={fontSize}
          value={code}
          onChange={onChange}
          language={exercise.language}
          label="Your code"
          onRun={() => exercise.mode !== 'typecheck' && void execute('run')}
          onTest={() => canRunTests && void execute('test')}
          minHeight={360}
        />
        {error && <p className="iv-error" role="alert">{error}</p>}
        {result && <Results result={result} mode={lastMode} sql={exercise.language.startsWith('sql')} />}
        {review && <ReviewPanel review={review} />}
        {solved && !showSolution && (
          <div className="box key">
            <span className="box-label">Solved</span>
            <p>
              Every test passed{solvedNote(readSolved()[key])}. Compare your code with the model solution, then try the
              follow-up questions or ask for a code review.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function Results({ result, mode, sql }: { result: RunResult; mode: 'run' | 'test'; sql: boolean }) {
  const t = result.tests;
  const status = mode === 'test' && t && sql
    ? result.ok ? '✓ Your result matches the expected rows' : '✗ Your result does not match the expected rows'
    : mode === 'test' && t
    ? result.ok
      ? `✓ All ${t.total} test${t.total === 1 ? '' : 's'} passed`
      : `✗ ${t.passed} of ${t.total} test${t.total === 1 ? '' : 's'} passed`
    : result.error
      ? sql ? '✗ Your query did not run' : '✗ Your code raised an error'
      : '✓ Ran without errors';
  return (
    <section className={result.ok ? 'ws-results ok' : 'ws-results fail'} aria-live="polite">
      <p className="ws-status">
        {status} <span className="ws-ms">{result.ms} ms</span>
      </p>
      {result.error && <pre className="ws-pre err">{result.error}</pre>}
      {t && t.failures.length > 0 && (
        <ul className="ws-failures">
          {t.failures.map((f, i) => (
            <li key={i}>
              <code className="ws-test">{f.code}</code>
              {f.expected !== undefined || f.got !== undefined ? (
                <div className="ws-diff">
                  <span>Expected</span>
                  <code>{f.expected}</code>
                  <span>Got</span>
                  <code>{f.got}</code>
                </div>
              ) : null}
              {f.message && <div className="ws-msg">{f.message}</div>}
            </li>
          ))}
        </ul>
      )}
      {t && !result.ok && t.passed + t.failures.length < t.total && (
        <p className="ws-msg">The tests stop at the first failure, so the remaining {t.total - t.passed - t.failures.length} did not run yet.</p>
      )}
      {result.typeErrors && result.typeErrors.length > 0 && (
        <>
          <p className="ws-sub">Type errors</p>
          <pre className="ws-pre warn">{result.typeErrors.join('\n')}</pre>
        </>
      )}
      {result.table && (
        <div className="ws-tables">
          <ResultTable title={`Your result (${result.table.count} row${result.table.count === 1 ? '' : 's'})`} table={result.table} />
          {result.expected && !result.ok && <ResultTable title={`Expected (${result.expected.count} row${result.expected.count === 1 ? '' : 's'})`} table={{ ...result.expected, columns: result.expected.columns.length ? result.expected.columns : result.table.columns }} />}
        </div>
      )}
      {result.stdout && (
        <>
          <p className="ws-sub">Output</p>
          <pre className="ws-pre">{result.stdout}</pre>
        </>
      )}
      {result.stderr && (
        <>
          <p className="ws-sub">Errors and warnings</p>
          <pre className="ws-pre warn">{result.stderr}</pre>
        </>
      )}
    </section>
  );
}

function ResultTable({ title, table }: { title: string; table: Table }) {
  const cols = useMemo(() => (table.columns.length ? table.columns : (table.rows[0] ?? []).map((_, i) => `col ${i + 1}`)), [table]);
  return (
    <div className="ws-table">
      <p className="ws-sub">{title}</p>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>{r.map((v, j) => <td key={j}>{v === null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** `code` spans in the reviewer's text, as React nodes (never as HTML: the text comes from a model). */
const withCode = (text: string) => text.split(/(`[^`\n]+`)/).map((part, i) => (part.length > 2 && part.startsWith('`') && part.endsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part));

function ReviewPanel({ review }: { review: Review }) {
  const list = (title: string, items: string[]) =>
    items.length > 0 && (
      <div className="iv-block">
        <h3>{title}</h3>
        <ul>{items.map((x, i) => <li key={i}>{withCode(x)}</li>)}</ul>
      </div>
    );
  return (
    <section className={`iv-feedback ${review.verdict === 'strong' ? 'v-pass' : ''}`} aria-live="polite">
      <div className="iv-score">
        <span className="iv-pct">{review.score}</span>
        <span className="iv-verdict">Code review · {review.verdict}</span>
      </div>
      <p>{withCode(review.summary)}</p>
      <p className="iv-stats">
        Time {withCode(review.complexity.time)} · space {withCode(review.complexity.space)}. {withCode(review.complexity.comment)}
      </p>
      {list('Correctness', review.correctness)}
      {list('Edge cases', review.edge_cases)}
      {list('Readability', review.readability)}
      {list('What the interviewer would ask next', review.interviewer_questions)}
    </section>
  );
}
