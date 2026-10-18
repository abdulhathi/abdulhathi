import { useEffect, useMemo, useRef, useState } from 'react';
import { findChapter, type Chapter } from '../chapters';
import { gradeAnswer, graderStatus, MODEL_LABEL, type Feedback, type GraderStatus } from '../lib/evaluate';
import { questionsOf, type Question } from '../lib/md';
import { useRatings } from '../lib/ratings';
import { hrefFor } from '../lib/route';
import { speak, speakingStats, useDictation } from '../lib/speech';
import { needsWork, nextToWork, useVoice, type VoiceResult } from '../lib/voice';
import { findPath } from '../paths';
import { Title, TopicLink } from './Cards';
import { Markdown } from './Markdown';
import { FeedbackPanel, LastAnswer, ScoreBadge } from './VoiceAnswer';

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

/**
 * The voice interviewer: one question at a time, scored. A question counts as done only after a passing answer, but you
 * can move between questions freely; a skipped one stays in the queue.
 */
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
  const index = current ? deck.indexOf(current) : -1;
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
          n={index + 1}
          total={deck.length}
          left={queue.filter((x) => needsWork(results[x.key], now)).length}
          ready={Boolean(status?.ready)}
          review={Boolean(results[current.key]?.passed)}
          // Pin the question first, so a passing answer keeps it on screen with its feedback until you press Next.
          onRecord={(score) => {
            setCurrentKey(current.key);
            record(current.key, score, settings.passMark);
          }}
          onNext={() => setCurrentKey(nextToWork(deck, index, (x) => needsWork(results[x.key], now))?.key ?? '__done__')}
          onPrev={index > 0 ? () => setCurrentKey(deck[index - 1].key) : undefined}
          onSkip={index < deck.length - 1 ? () => setCurrentKey(deck[index + 1].key) : undefined}
        />
      )}

      <QuestionList deck={deck} results={results} passMark={settings.passMark} currentKey={current?.key} now={now} onPick={setCurrentKey} />
    </div>
  );
}

/** Every question in the interview with your best score; pick one to answer it now. */
function QuestionList({
  deck,
  results,
  passMark,
  currentKey,
  now,
  onPick,
}: {
  deck: Item[];
  results: Readonly<Record<string, VoiceResult>>;
  passMark: number;
  currentKey: string | undefined;
  now: number;
  onPick: (key: string) => void;
}) {
  const answered = deck.filter((x) => results[x.key]?.attempts);
  const average = answered.length ? Math.round(answered.reduce((s, x) => s + results[x.key].best, 0) / answered.length) : null;
  return (
    <details className="iv-list" open>
      <summary>
        All questions · {answered.length} of {deck.length} answered{average !== null ? ` · average best score ${average}%` : ''}
      </summary>
      <ol>
        {deck.map((x) => {
          const r = results[x.key];
          const state = r?.passed ? (needsWork(r, now) ? 'due' : 'passed') : r?.attempts ? 'not yet' : 'new';
          return (
            <li key={x.key}>
              <button
                type="button"
                className={x.key === currentKey ? 'iv-pick on' : 'iv-pick'}
                aria-current={x.key === currentKey ? 'true' : undefined}
                onClick={() => onPick(x.key)}
              >
                <Title text={x.q.title} as="span" className="iv-pick-title" />
                <span className="iv-pick-state">{state === 'due' ? 'review due' : state === 'new' ? '' : state}</span>
                <ScoreBadge result={r} passMark={passMark} />
              </button>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

function QuestionRound({
  item,
  n,
  total,
  left,
  ready,
  review,
  onRecord,
  onNext,
  onPrev,
  onSkip,
}: {
  item: Item;
  n: number;
  total: number;
  left: number;
  ready: boolean;
  review: boolean;
  onRecord: (score: number) => void;
  onNext: () => void;
  onPrev?: () => void;
  onSkip?: () => void;
}) {
  const { settings, results, answers, saveAnswer } = useVoice();
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
    const spoken = speakingStats(answer, dictation.spokenMs);
    setTries((t) => t + 1);
    setFeedback(result.feedback);
    setStats(spoken);
    onRecord(result.feedback.score);
    saveAnswer(item.key, { answer, feedback: result.feedback, at: Date.now(), stats: spoken });
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
      <div className="iv-nav">
        <button type="button" className="chip-btn" onClick={onPrev} disabled={!onPrev || grading}>← Previous</button>
        <p className="iv-meta">
          {review ? 'Review' : 'Question'} {n} of {total} · {left} to pass · <a href={hrefFor(item.chapter.id, item.q.id)}>{item.chapter.title}</a>
          {tries > 0 && ` · attempt ${tries + (feedback && !passed ? 1 : 0)}`}
        </p>
        <ScoreBadge result={results[item.key]} passMark={settings.passMark} />
        <button type="button" className="chip-btn" onClick={onSkip} disabled={!onSkip || grading}>{passed ? 'Next →' : 'Skip →'}</button>
      </div>
      <h2 className="iv-q">
        <Title text={item.q.title} as="span" />
      </h2>
      <p className="qtopic">
        <TopicLink chapterId={item.chapter.id} questionId={item.q.id} elsewhere />
      </p>
      <button type="button" className="chip-btn" onClick={() => speak(item.q.title)}>🔊 Read the question again</button>

      {!feedback && (
        <div className="iv-answer">
          <LastAnswer saved={answers[item.key]} passMark={settings.passMark} />
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
                You need {settings.passMark}% to pass this question. Fix what is missing and answer again, or press Skip to come
                back to it later: it stays in your queue until it passes.
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
          {!passed && <p className="iv-note">Now say it in your own words. The question stays in your queue until an answer passes.</p>}
        </div>
      )}
    </article>
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
