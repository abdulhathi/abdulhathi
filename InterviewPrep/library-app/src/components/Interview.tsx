import { useEffect, useMemo, useRef, useState } from 'react';
import { findChapter, type Chapter } from '../chapters';
import { gradeAnswer, graderStatus, MODEL_LABEL, type Feedback, type GraderStatus } from '../lib/evaluate';
import { questionsOf, type Question } from '../lib/md';
import { useRatings } from '../lib/ratings';
import { hrefFor } from '../lib/route';
import { speak, speakingStats, useDictation } from '../lib/speech';
import { needsWork, useVoice } from '../lib/voice';
import { findPath } from '../paths';
import { Title } from './Cards';
import { Markdown } from './Markdown';

type Item = { key: string; chapter: Chapter; q: Question };

/** What an interview covers: a learning path ("redis") or one chapter ("c-sse"). */
export function interviewScope(scopeId: string) {
  if (scopeId.startsWith('c-')) {
    const chapter = findChapter(scopeId.slice(2));
    return chapter ? { title: chapter.title, chapters: [chapter], back: hrefFor(chapter.id), backLabel: 'Back to the chapter' } : undefined;
  }
  const path = findPath(scopeId);
  if (!path) return undefined;
  return {
    title: `${path.title} learning path`,
    chapters: path.chapters.map((id) => findChapter(id)).filter((c): c is Chapter => Boolean(c)),
    back: hrefFor('path', path.id),
    backLabel: 'Back to the learning path',
  };
}

const MAX_TRIES_BEFORE_REFERENCE = 2;

/** The voice interviewer: one question at a time, scored, and you move on only after a passing answer. */
export function Interview({ scopeId }: { scopeId: string }) {
  const scope = interviewScope(scopeId);
  const { results, record, settings, setSettings } = useVoice();
  const [status, setStatus] = useState<GraderStatus | null>(null);
  useEffect(() => {
    let live = true;
    void graderStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);

  const deck: Item[] = useMemo(
    () =>
      (scope?.chapters ?? []).flatMap((c) =>
        questionsOf(c.doc)
          .filter((q) => !settings.mustKnowOnly || q.tags.includes('core'))
          .map((q) => ({ key: `${c.id}/${q.id}`, chapter: c, q })),
      ),
    [scope?.chapters, settings.mustKnowOnly],
  );
  // The queue is decided when the page opens or the deck changes, not on every answer, so passing a question
  // never reshuffles what comes next.
  const [now] = useState(() => Date.now());
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const queue = deck.filter((x) => needsWork(results[x.key], now) || x.key === currentKey);
  const current = deck.find((x) => x.key === currentKey) ?? queue[0];
  const passedCount = deck.filter((x) => results[x.key]?.passed).length;
  const dueCount = deck.filter((x) => results[x.key]?.passed && needsWork(results[x.key], now)).length;

  if (!scope) return <p className="md prose">There is no learning path or chapter called “{scopeId}”.</p>;

  return (
    <div className="interview">
      <div className="iv-bar">
        <p className="drill-score">
          {passedCount} of {deck.length} questions passed{dueCount ? ` · ${dueCount} due for review` : ''} · pass mark {settings.passMark}%
        </p>
        <a className="chip-btn" href={scope.back}>{scope.backLabel}</a>
      </div>

      <details className="iv-settings">
        <summary>Interview settings</summary>
        <div className="tracker-filters">
          <label className="field">
            <span>Grader</span>
            <select value={settings.model} onChange={(e) => setSettings({ model: e.target.value })}>
              {Object.entries(MODEL_LABEL).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Pass mark</span>
            <select value={settings.passMark} onChange={(e) => setSettings({ passMark: Number(e.target.value) })}>
              {[70, 75, 80, 85, 90].map((m) => (
                <option key={m} value={m}>{m}%</option>
              ))}
            </select>
          </label>
          <label className="chk">
            <input type="checkbox" checked={settings.mustKnowOnly} onChange={(e) => setSettings({ mustKnowOnly: e.target.checked })} /> Must-know questions only
          </label>
          <label className="chk">
            <input type="checkbox" checked={settings.readAloud} onChange={(e) => setSettings({ readAloud: e.target.checked })} /> Read each question aloud
          </label>
        </div>
        <p className="iv-note">
          Spoken answers are transcribed by your browser (Chrome sends the audio to Google's speech service) and graded by
          Claude through the library's dev server. Each graded answer uses your Claude API credit; Opus gives the most
          useful feedback, Haiku costs the least.
        </p>
      </details>

      {status && !status.ready && (
        <div className="box warn" role="status">
          <span className="box-label">The grader is not ready</span>
          <p>{status.reason}</p>
          <p>Once signed in, restart the library from Study Hub (Stop, then Start) and reload this page.</p>
        </div>
      )}

      {!current ? (
        <div className="box key">
          <span className="box-label">All passed</span>
          <p>
            Every {settings.mustKnowOnly ? 'must-know ' : ''}question here has a passing answer. Passed questions come back
            for a quick review after 3, 7 and 21 days.
            {settings.mustKnowOnly ? ' Switch off "Must-know questions only" in the settings to go through the rest.' : ''}
          </p>
        </div>
      ) : (
        <QuestionRound
          key={current.key}
          item={current}
          left={queue.length}
          ready={Boolean(status?.ready)}
          review={Boolean(results[current.key]?.passed)}
          // Pin the question first, so a passing answer keeps it on screen with its feedback until you press Next.
          onRecord={(score) => {
            setCurrentKey(current.key);
            record(current.key, score, settings.passMark);
          }}
          onNext={() => setCurrentKey(queue.find((x) => x.key !== current.key && needsWork(results[x.key], now))?.key ?? '__done__')}
        />
      )}
    </div>
  );
}

function QuestionRound({
  item,
  left,
  ready,
  review,
  onRecord,
  onNext,
}: {
  item: Item;
  left: number;
  ready: boolean;
  review: boolean;
  onRecord: (score: number) => void;
  onNext: () => void;
}) {
  const { settings } = useVoice();
  const { setRating } = useRatings();
  const dictation = useDictation();
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState('');
  const [tries, setTries] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [stats, setStats] = useState<ReturnType<typeof speakingStats> | null>(null);
  const [passed, setPassed] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const spokenAloud = useRef(false);

  // Ask the question out loud once, like an interviewer.
  useEffect(() => {
    if (!settings.readAloud || spokenAloud.current) return;
    spokenAloud.current = true;
    return speak(item.q.title);
  }, [item.q.title, settings.readAloud]);

  async function submit() {
    if (dictation.listening) dictation.stop();
    const answer = dictation.text.trim();
    if (!answer) return;
    setGrading(true);
    setError('');
    const result = await gradeAnswer({
      chapterId: item.chapter.id,
      questionId: item.q.id,
      answer,
      attempt: tries + 1,
      passMark: settings.passMark,
      model: settings.model,
    });
    setGrading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTries((t) => t + 1);
    setFeedback(result.feedback);
    setStats(speakingStats(answer, dictation.spokenMs));
    onRecord(result.feedback.score);
    const ok = result.feedback.score >= settings.passMark;
    if (ok) setPassed(true);
    setRating(item.key, ok ? 'good' : passed ? 'good' : result.feedback.verdict === 'close' ? 'shaky' : 'missed');
  }

  function tryAgain() {
    dictation.reset();
    setFeedback(null);
    setStats(null);
    setError('');
  }

  const canReveal = !passed && tries >= MAX_TRIES_BEFORE_REFERENCE;

  return (
    <article className="iv-card">
      <p className="iv-meta">
        {review ? 'Review' : 'Question'} · {left} left · <a href={hrefFor(item.chapter.id, item.q.id)}>{item.chapter.title}</a>
        {tries > 0 && ` · attempt ${tries + (feedback && !passed ? 1 : 0)}`}
      </p>
      <h2 className="iv-q">
        <Title text={item.q.title} as="span" />
      </h2>
      <button type="button" className="chip-btn" onClick={() => speak(item.q.title)}>🔊 Read the question again</button>

      {!feedback && (
        <div className="iv-answer">
          <div className="iv-mic">
            {dictation.supported ? (
              <button
                type="button"
                className={dictation.listening ? 'mic-btn on' : 'mic-btn'}
                onClick={dictation.listening ? dictation.stop : dictation.start}
                aria-pressed={dictation.listening}
                disabled={grading}
              >
                {dictation.listening ? '■ Stop' : '🎤 Answer out loud'}
              </button>
            ) : (
              <p className="iv-note">Speech recognition needs Chrome or Edge. Type your answer instead.</p>
            )}
            {dictation.listening && <span className="iv-live" role="status">Listening… speak as you would to an interviewer.</span>}
          </div>
          {dictation.error && <p className="iv-error" role="alert">{dictation.error}</p>}
          <label className="field iv-text">
            <span>Your answer (you can edit the transcript before submitting)</span>
            <textarea
              value={dictation.text}
              onChange={(e) => dictation.setText(e.target.value)}
              rows={6}
              placeholder="Press the microphone and answer out loud, or type here."
              disabled={dictation.listening}
            />
          </label>
          <div className="pcard-actions">
            <button type="button" className="chip-btn reveal" onClick={() => void submit()} disabled={!ready || grading || !dictation.text.trim()}>
              {grading ? 'Grading…' : 'Submit answer'}
            </button>
            {dictation.text && (
              <button type="button" className="chip-btn" onClick={dictation.reset} disabled={grading}>Clear</button>
            )}
          </div>
          {error && <p className="iv-error" role="alert">{error}</p>}
        </div>
      )}

      {feedback && <FeedbackPanel feedback={feedback} stats={stats} passMark={settings.passMark} />}

      {feedback && (
        <div className="iv-gate">
          {passed ? (
            <>
              <button type="button" className="chip-btn reveal big" onClick={onNext}>Next question →</button>
              <FollowUp item={item} question={feedback.follow_up} />
            </>
          ) : (
            <>
              <p className="iv-note">
                An interviewer would not move on yet. Fix what is missing and answer again: you need {settings.passMark}% to
                continue.
              </p>
              <button type="button" className="chip-btn reveal" onClick={tryAgain}>Try again</button>
              {canReveal && !showReference && (
                <button type="button" className="chip-btn" onClick={() => setShowReference(true)}>Show me a strong answer</button>
              )}
            </>
          )}
        </div>
      )}

      {(showReference || passed) && feedback && (
        <div className="iv-reference">
          <h3>Your answer, improved</h3>
          <p>{feedback.better_answer}</p>
          <details>
            <summary>The library's model answer</summary>
            <Markdown src={item.q.body} />
          </details>
          {!passed && <p className="iv-note">Now say it in your own words. You still need a passing answer to move on.</p>}
        </div>
      )}
    </article>
  );
}

function FeedbackPanel({ feedback, stats, passMark }: { feedback: Feedback; stats: ReturnType<typeof speakingStats> | null; passMark: number }) {
  const ok = feedback.score >= passMark;
  return (
    <section className={`iv-feedback v-${feedback.verdict}`} aria-live="polite">
      <div className="iv-score">
        <span className="iv-pct">{feedback.score}%</span>
        <span className="iv-verdict">{ok ? 'Pass' : feedback.verdict === 'close' ? 'Close: not yet' : 'Not yet'}</span>
      </div>
      <p>{feedback.summary}</p>
      <FeedbackList title="What you got right" items={feedback.strengths} kind="good" />
      <FeedbackList title="What the interviewer expected and did not hear" items={feedback.missing} kind="missing" />
      <FeedbackList title="Corrections" items={feedback.incorrect} kind="wrong" />
      {feedback.grammar.length > 0 && (
        <div className="iv-block">
          <h3>Grammar and wording</h3>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr><th>You said</th><th>Better</th><th>Why</th></tr>
              </thead>
              <tbody>
                {feedback.grammar.map((g, i) => (
                  <tr key={i}>
                    <td className="g-orig">{g.original}</td>
                    <td className="g-fix">{g.corrected}</td>
                    <td>{g.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {stats && stats.words > 0 && (
        <p className="iv-stats">
          {stats.words} words
          {stats.seconds > 0 && ` in ${stats.seconds} s`}
          {stats.wpm !== null && ` · ${stats.wpm} words a minute${stats.wpm > 170 ? ' (slow down a little)' : stats.wpm < 100 ? ' (a little faster is fine)' : ''}`}
          {stats.fillerCount > 0 && ` · filler words: ${stats.fillers.map((f) => `"${f.word}" ×${f.count}`).join(', ')}`}
          {stats.seconds > 120 && ' · aim for 30–90 seconds, then let them ask for more'}
        </p>
      )}
      {feedback.speech_to_text.length > 0 && (
        <p className="iv-note">Probably speech-recognition slips (not counted): {feedback.speech_to_text.join('; ')}</p>
      )}
    </section>
  );
}

function FeedbackList({ title, items, kind }: { title: string; items: string[]; kind: string }) {
  if (!items.length) return null;
  return (
    <div className={`iv-block k-${kind}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

/** The interviewer's follow-up, after a pass. Optional, scored, not a gate. */
function FollowUp({ item, question }: { item: Item; question: string }) {
  const { settings } = useVoice();
  const dictation = useDictation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState('');
  if (!question) return null;

  async function submit() {
    if (dictation.listening) dictation.stop();
    setBusy(true);
    setError('');
    const r = await gradeAnswer({
      chapterId: item.chapter.id,
      questionId: item.q.id,
      answer: dictation.text,
      attempt: 1,
      passMark: settings.passMark,
      model: settings.model,
      followUp: question,
    });
    setBusy(false);
    if (r.ok) setFeedback(r.feedback);
    else setError(r.error);
  }

  return (
    <div className="iv-followup">
      <p>
        <b>Interviewer follow-up:</b> {question}
      </p>
      {!open ? (
        <button type="button" className="chip-btn" onClick={() => { setOpen(true); speak(question); }}>Answer the follow-up</button>
      ) : feedback ? (
        <FeedbackPanel feedback={feedback} stats={null} passMark={settings.passMark} />
      ) : (
        <>
          <div className="pcard-actions">
            {dictation.supported && (
              <button type="button" className={dictation.listening ? 'mic-btn on' : 'mic-btn'} onClick={dictation.listening ? dictation.stop : dictation.start}>
                {dictation.listening ? '■ Stop' : '🎤 Answer out loud'}
              </button>
            )}
          </div>
          <textarea value={dictation.text} onChange={(e) => dictation.setText(e.target.value)} rows={4} aria-label="Your follow-up answer" disabled={dictation.listening} />
          <button type="button" className="chip-btn reveal" onClick={() => void submit()} disabled={busy || !dictation.text.trim()}>
            {busy ? 'Grading…' : 'Submit follow-up'}
          </button>
          {error && <p className="iv-error" role="alert">{error}</p>}
        </>
      )}
    </div>
  );
}
