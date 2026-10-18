import { useEffect, useMemo, useState } from 'react';
import { ALL_QUESTIONS } from '../chapters';
import { MicButton, RateButtons, TagBadges, Title, TopicLink } from '../components/Cards';
import { Markdown } from '../components/Markdown';
import { LastAnswer, ScoreBadge, VoiceAnswer } from '../components/VoiceAnswer';
import { useRatings } from '../lib/ratings';
import { hrefFor } from '../lib/route';
import { useScope } from '../lib/scope';
import { useActiveTrack } from '../lib/track';
import { useVoice } from '../lib/voice';
import { newSeed, shuffle } from '../lib/random';

type Which = 'all' | 'unrated' | 'weak';

export function Drill() {
  const { ratings } = useRatings();
  const { results, answers, settings } = useVoice();
  const { track } = useActiveTrack();
  const { scopes, scope, setScope } = useScope(track);
  const [coreOnly, setCoreOnly] = useState(true);
  const [which, setWhich] = useState<Which>('all');
  const [seed, setSeed] = useState(newSeed);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // The deck is fixed when the filters change, not when a card is rated, so rating never reshuffles it.
  const deck = useMemo(() => {
    const pool = ALL_QUESTIONS.filter(
      (x) =>
        scope.includes(x.chapter) &&
        (!coreOnly || x.q.tags.includes('core')) &&
        (which === 'all' || (which === 'unrated' ? !ratings[x.key] : ratings[x.key] === 'shaky' || ratings[x.key] === 'missed')),
    );
    return shuffle(pool, seed);
  }, [scope.id, coreOnly, which, seed]);

  useEffect(() => {
    setIndex(0);
    setShown(false);
    setSpeaking(false);
  }, [deck]);

  const card = deck[index];
  const go = (step: number) => {
    setIndex((i) => Math.min(Math.max(i + step, 0), deck.length - 1));
    setShown(false);
    setSpeaking(false);
  };
  const good = deck.filter((x) => ratings[x.key] === 'good').length;

  return (
    <div className="drill">
      <div className="tracker-filters">
        <label className="field">
          <span>Cover</span>
          <select value={scope.id} onChange={(e) => setScope(e.target.value)}>
            {scopes.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Cards</span>
          <select value={which} onChange={(e) => setWhich(e.target.value as Which)}>
            <option value="all">All</option>
            <option value="unrated">Not rated yet</option>
            <option value="weak">Shaky or missed</option>
          </select>
        </label>
        <label className="chk">
          <input type="checkbox" checked={coreOnly} onChange={(e) => setCoreOnly(e.target.checked)} /> Must know only
        </label>
        <button type="button" className="chip-btn" onClick={() => setSeed(newSeed())}>Shuffle</button>
      </div>

      {!card ? (
        <p className="drill-empty">No cards match these filters. Try another scope or switch off "Must know only".</p>
      ) : (
        <>
          <div className="drill-bar">
            <p className="drill-score">
              Card {index + 1} of {deck.length} · {good} nailed in this deck
            </p>
          </div>
          <article className="drill-card">
            <p className="drill-q">
              <a href={hrefFor(card.chapter.id, card.q.id)}>{card.chapter.num} {card.chapter.title}</a>
              <TagBadges tags={card.q.tags} />
              <ScoreBadge result={results[card.key]} passMark={settings.passMark} />
            </p>
            <Title text={card.q.title} as="p" className="drill-summary" />
            <p className="qtopic">
              <TopicLink chapterId={card.chapter.id} questionId={card.q.id} elsewhere />
            </p>
            {speaking ? (
              <VoiceAnswer key={card.key} chapterId={card.chapter.id} q={card.q} onClose={() => setSpeaking(false)} />
            ) : (
              <LastAnswer key={card.key} saved={answers[card.key]} passMark={settings.passMark} />
            )}
            {shown ? (
              <div className="answer">
                <Markdown src={card.q.body} />
              </div>
            ) : (
              <p className="drill-tip">Answer out loud as if the interviewer just asked, then reveal.</p>
            )}
            <div className="pcard-actions">
              {!speaking && <MicButton again={Boolean(answers[card.key])} onClick={() => setSpeaking(true)} />}
              {!shown && (
                <button type="button" className="chip-btn reveal" onClick={() => setShown(true)}>Show answer</button>
              )}
              {shown && <RateButtons id={card.key} />}
            </div>
          </article>
          <div className="pager-btns">
            <button type="button" className="chip-btn" disabled={index === 0} onClick={() => go(-1)}>← Previous</button>
            <button type="button" className="chip-btn reveal" disabled={index === deck.length - 1} onClick={() => go(1)}>Next card →</button>
          </div>
        </>
      )}
    </div>
  );
}
