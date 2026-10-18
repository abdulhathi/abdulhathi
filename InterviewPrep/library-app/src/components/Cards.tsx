import { findChapter } from '../chapters';
import { hrefFor } from '../lib/route';
import { hasExercises } from '../lib/code';
import { useEffect, useState } from 'react';
import type { Problem, Question } from '../lib/md';
import { inlineHtml } from '../lib/markdown';
import { RATING_LABEL, useRatings, type Rating } from '../lib/ratings';
import { useAnchorTarget } from '../lib/route';
import { topicOf } from '../lib/topics';
import { useVoice } from '../lib/voice';
import { Markdown } from './Markdown';
import { SavedAnswerView, ScoreBadge, VoiceAnswer } from './VoiceAnswer';

export function Title({ text, as: Tag = 'h3', className }: { text: string; as?: 'h3' | 'h4' | 'p' | 'span'; className?: string }) {
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: inlineHtml(text) }} />;
}

export function RateButtons({ id }: { id: string }) {
  const { ratings, rate } = useRatings();
  const current = ratings[id];
  return (
    <div className="rate" role="group" aria-label="Rate yourself">
      {(Object.keys(RATING_LABEL) as Rating[]).map((r) => (
        <button key={r} type="button" className={`chip-btn rate-${r}${current === r ? ' on' : ''}`} aria-pressed={current === r} onClick={() => rate(id, r)}>
          {RATING_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

export function TagBadges({ tags }: { tags: string[] }) {
  return (
    <>
      {tags.includes('core') && <span className="badge core">Must know</span>}
      {tags.includes('deep') && <span className="badge deep">Follow-up</span>}
    </>
  );
}

/**
 * A link to the part of the chapter that teaches a question. Inside the chapter it names just the section (and is
 * left out when no one section covers the question). Elsewhere it names the chapter too, falls back to the chapter
 * when there is no section, and opens in a new tab so the round you are in stays as it is.
 */
export function TopicLink({ chapterId, questionId, elsewhere }: { chapterId: string; questionId: string; elsewhere?: boolean }) {
  const chapter = findChapter(chapterId);
  const topic = topicOf(chapterId, questionId);
  if (!chapter || (!topic && !elsewhere)) return null;
  const label = topic ? (elsewhere ? `${chapter.title} › ${topic.title}` : topic.title) : chapter.title;
  return (
    <a
      className="topic-link"
      href={hrefFor(chapterId, topic?.anchor)}
      target={elsewhere ? '_blank' : undefined}
      rel={elsewhere ? 'noopener' : undefined}
      title={elsewhere ? 'Opens in a new tab' : undefined}
    >
      <span aria-hidden="true">📖 </span>Topic: <span dangerouslySetInnerHTML={{ __html: inlineHtml(label) }} />
    </a>
  );
}

/** The 🎤 button that opens a question's answer-out-loud panel. `again` when there is a saved answer it will replace. */
export function MicButton({ again, onClick }: { again?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="chip-btn mic-chip" onClick={onClick}>
      {again ? '🎤 Answer again' : '🎤 Answer out loud'}
    </button>
  );
}

/**
 * A question as a collapsible panel. The title and your spoken score always show; open it to answer out loud, reveal
 * the model answer and rate yourself. Pass `expanded` and `onExpandedChange` to control it from a list (expand all).
 */
export function QuestionCard({
  chapterId,
  q,
  n,
  open: forced,
  expanded,
  onExpandedChange,
  elsewhere,
}: {
  chapterId: string;
  q: Question;
  n: number;
  /** Shown outside its chapter (mock interview): the topic link names the chapter and opens in a new tab. */
  elsewhere?: boolean;
  /** Show the model answer (the list's "Show all answers"). */
  open?: boolean;
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
}) {
  const { ref, targeted } = useAnchorTarget<HTMLElement>(q.id);
  const { results, answers, settings } = useVoice();
  const [own, setOwn] = useState(false);
  const [shown, setShown] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const isOpen = expanded ?? own;
  const setOpen = onExpandedChange ?? setOwn;
  const answerOpen = forced || shown || targeted;
  const key = `${chapterId}/${q.id}`;

  // A link straight to this question opens its panel.
  useEffect(() => {
    if (targeted) setOpen(true);
  }, [targeted]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section id={q.id} ref={ref} className={targeted ? 'qcard targeted' : 'qcard'}>
      <div className="qcard-head">
        <h3 className="qtitle">
          <button type="button" className="qtoggle" aria-expanded={isOpen} aria-controls={`${q.id}-body`} onClick={() => setOpen(!isOpen)}>
            <span className="qchev" aria-hidden="true">▸</span>
            <span className="pnum">Q{n}</span>{' '}
            <span dangerouslySetInnerHTML={{ __html: inlineHtml(q.title) }} />
          </button>
        </h3>
        <TagBadges tags={q.tags} />
        <ScoreBadge result={results[key]} passMark={settings.passMark} />
      </div>
      <p className="qtopic">
        <TopicLink chapterId={chapterId} questionId={q.id} elsewhere={elsewhere} />
      </p>
      {/* Hidden rather than removed, so closing a panel keeps a recording or its feedback. */}
      <div id={`${q.id}-body`} className="qcard-body" hidden={!isOpen}>
        {speaking ? (
          <VoiceAnswer chapterId={chapterId} q={q} onClose={() => setSpeaking(false)} />
        ) : (
          answers[key] && <SavedAnswerView saved={answers[key]} passMark={settings.passMark} />
        )}
        {answerOpen ? (
          <div className="answer">
            <Markdown src={q.body} />
          </div>
        ) : null}
        <div className="pcard-actions">
          {!speaking && <MicButton again={Boolean(answers[key])} onClick={() => setSpeaking(true)} />}
          {!forced && (
            <button type="button" className="chip-btn reveal" aria-expanded={answerOpen} onClick={() => setShown((s) => !s)}>
              {answerOpen ? 'Hide answer' : 'Show answer'}
            </button>
          )}
          <RateButtons id={key} />
        </div>
      </div>
    </section>
  );
}

const LEVEL_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

/** A coding problem: the statement is open, hints come one at a time, then the solution. */
export function ProblemCard({ chapterId, p, n }: { chapterId: string; p: Problem; n: number }) {
  const { ref, targeted } = useAnchorTarget<HTMLElement>(p.id);
  const [hints, setHints] = useState(0);
  const [solved, setSolved] = useState(false);
  return (
    <section id={p.id} ref={ref} className={targeted ? 'qcard prob targeted' : 'qcard prob'}>
      <div className="qcard-head">
        <span className="pnum">P{n}</span>
        <Title text={p.title} className="qtitle" />
        <span className={`diff ${p.level}`}>{LEVEL_LABEL[p.level]}</span>
        <TagBadges tags={p.tags} />
      </div>
      <Markdown src={p.statement} className="md statement" />
      {hints > 0 && (
        <ol className="phints">
          {p.hints.slice(0, hints).map((h, i) => (
            <li key={i}>
              <span className="phint-n">Hint {i + 1}</span>
              <span dangerouslySetInnerHTML={{ __html: inlineHtml(h) }} />
            </li>
          ))}
        </ol>
      )}
      {solved && (
        <div className="solution">
          <p className="plabel">Solution</p>
          <Markdown src={p.solution} />
          {p.followUps && (
            <>
              <p className="plabel">Follow-ups the interviewer may ask</p>
              <Markdown src={p.followUps} />
            </>
          )}
        </div>
      )}
      <div className="pcard-actions">
        {hints < p.hints.length && !solved && (
          <button type="button" className="chip-btn" onClick={() => setHints((h) => h + 1)}>
            {hints === 0 ? 'Show a hint' : `Next hint (${hints + 1} of ${p.hints.length})`}
          </button>
        )}
        {hasExercises(chapterId) && (
          <a className="chip-btn code-link" href={hrefFor('code', `${chapterId}/${p.id}`)}>💻 Solve in the editor</a>
        )}
        <button type="button" className="chip-btn reveal" aria-expanded={solved} onClick={() => setSolved((s) => !s)}>
          {solved ? 'Hide solution' : 'Show solution'}
        </button>
        <RateButtons id={`${chapterId}/${p.id}`} />
      </div>
    </section>
  );
}
