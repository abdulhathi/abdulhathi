import { useEffect, useState } from 'react';
import { gradeAnswer, graderStatus, MODEL_LABEL, type Feedback, type GraderStatus } from '../lib/evaluate';
import type { Question } from '../lib/md';
import { useRatings } from '../lib/ratings';
import { speakingStats, useDictation, type SpeakingStats as Stats } from '../lib/speech';
import { useVoice, type SavedAnswer, type VoiceResult } from '../lib/voice';

/** Your spoken score on a question: the best answer so far, coloured by the pass mark. Nothing until you have answered. */
export function ScoreBadge({ result, passMark }: { result: VoiceResult | undefined; passMark: number }) {
  if (!result || !result.attempts) return null;
  const tone = result.best >= passMark ? 'pass' : result.best >= passMark - 15 ? 'close' : 'fail';
  const tries = `${result.attempts} ${result.attempts === 1 ? 'answer' : 'answers'}`;
  const last = result.lastScore !== undefined && result.lastScore !== result.best ? `, last ${result.lastScore}%` : '';
  return (
    <span className={`score-badge ${tone}`} title={`Best spoken answer ${result.best}%${last} · ${tries}`}>
      {tone === 'pass' ? '✓ ' : ''}
      {result.best}%
    </span>
  );
}

/**
 * Answer one question out loud, right where it is: record, edit the transcript, get it scored. Unlike the interviewer
 * there is no gate. The score goes into the same results as the interviewer's, and the answer with its feedback is
 * saved for the question, replacing the one before; then `onClose` hands back to the saved view.
 */
export function VoiceAnswer({ chapterId, q, onClose }: { chapterId: string; q: Question; onClose: () => void }) {
  const key = `${chapterId}/${q.id}`;
  const { results, record, answers, saveAnswer, settings } = useVoice();
  const { setRating } = useRatings();
  const dictation = useDictation();
  const [status, setStatus] = useState<GraderStatus | null>(null);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState('');
  const previous = answers[key];

  useEffect(() => {
    let live = true;
    void graderStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);

  async function submit() {
    if (dictation.listening) dictation.stop();
    const answer = dictation.text.trim();
    if (!answer) return;
    setGrading(true);
    setError('');
    const result = await gradeAnswer({
      chapterId,
      questionId: q.id,
      answer,
      attempt: (results[key]?.attempts ?? 0) + 1,
      passMark: settings.passMark,
      model: settings.model,
    });
    setGrading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const ok = result.feedback.score >= settings.passMark;
    record(key, result.feedback.score, settings.passMark);
    setRating(key, ok ? 'good' : result.feedback.verdict === 'close' ? 'shaky' : 'missed');
    saveAnswer(key, { answer, feedback: result.feedback, at: Date.now(), stats: speakingStats(answer, dictation.spokenMs) });
    onClose();
  }

  return (
    <div className="va" aria-label="Answer out loud" role="group">
      {status && !status.ready && (
        <p className="iv-error" role="status">
          The grader is not ready: {status.reason}
        </p>
      )}
      <div className="iv-mic">
        {dictation.supported ? (
          <button
            type="button"
            className={dictation.listening ? 'mic-btn small on' : 'mic-btn small'}
            onClick={dictation.listening ? dictation.stop : dictation.start}
            aria-pressed={dictation.listening}
            disabled={grading}
          >
            {dictation.listening ? '■ Stop' : '🎤 Record'}
          </button>
        ) : (
          <span className="iv-note">Speech recognition needs Chrome or Edge. Type your answer instead.</span>
        )}
        {dictation.listening && <span className="iv-live" role="status">Listening…</span>}
      </div>
      {dictation.error && <p className="iv-error" role="alert">{dictation.error}</p>}
      <textarea
        className="va-text"
        aria-label="Your spoken answer"
        value={dictation.text}
        onChange={(e) => dictation.setText(e.target.value)}
        rows={4}
        placeholder="Press Record and answer out loud, or type here. You can edit the transcript before submitting."
        disabled={dictation.listening}
      />
      {previous && (
        <p className="iv-note">
          Scoring this answer replaces your saved one ({previous.feedback.score}%, {when(previous.at)}).
        </p>
      )}
      <div className="pcard-actions">
        <button type="button" className="chip-btn reveal" onClick={() => void submit()} disabled={grading || !dictation.text.trim() || status?.ready === false}>
          {grading ? 'Grading…' : 'Score my answer'}
        </button>
        <button type="button" className="chip-btn" onClick={onClose} disabled={grading}>Cancel</button>
      </div>
      {error && <p className="iv-error" role="alert">{error}</p>}
    </div>
  );
}

function when(at: number) {
  return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Your saved answer to a question: what you said, the score and corrections, and your answer improved. */
export function SavedAnswerView({ saved, passMark }: { saved: SavedAnswer; passMark: number }) {
  return (
    <div className="saved" aria-label="Your saved answer" role="group">
      <p className="saved-meta">
        Your answer · {when(saved.at)}
        {MODEL_LABEL[saved.feedback.model] ? ` · graded by ${MODEL_LABEL[saved.feedback.model].replace(/ \(.*\)$/, '')}` : ''}
      </p>
      <blockquote className="saved-text">{saved.answer}</blockquote>
      <FeedbackPanel feedback={saved.feedback} stats={saved.stats ?? null} passMark={passMark} />
      {saved.feedback.better_answer && (
        <details className="saved-better">
          <summary>Your answer, improved</summary>
          <p>{saved.feedback.better_answer}</p>
        </details>
      )}
    </div>
  );
}

/** The saved answer folded away, for places where seeing it first would give the answer away (interviewer, drill). */
export function LastAnswer({ saved, passMark }: { saved: SavedAnswer | undefined; passMark: number }) {
  if (!saved) return null;
  return (
    <details className="last-answer">
      <summary>
        Your last answer · {saved.feedback.score}% · {when(saved.at)}
      </summary>
      <SavedAnswerView saved={saved} passMark={passMark} />
    </details>
  );
}

export function FeedbackPanel({ feedback, stats, passMark }: { feedback: Feedback; stats: Stats | null; passMark: number }) {
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
