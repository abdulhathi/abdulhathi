import { useState, type ReactNode } from 'react';
import type { Chapter } from '../chapters';
import { problemsOf, questionsOf, slug, type Section } from '../lib/md';
import { inlineHtml } from '../lib/markdown';
import { useRatings } from '../lib/ratings';
import { hrefFor, useAnchorTarget } from '../lib/route';
import { ProblemCard, QuestionCard, Title } from './Cards';
import { Markdown } from './Markdown';

export function ChapterView({ chapter }: { chapter: Chapter }) {
  const { doc } = chapter;
  const questions = questionsOf(doc);
  const problems = problemsOf(doc);
  const { ratings } = useRatings();
  const rated = [...questions.map((q) => q.id), ...problems.map((p) => p.id)].filter((id) => ratings[`${chapter.id}/${id}`]).length;
  const total = questions.length + problems.length;

  return (
    <>
      {chapter.group !== 'Start here' && (
        <p className="ch-meta">
          {chapter.minutes > 0 && <span>About {chapter.minutes} min</span>}
          {questions.length > 0 && <span>{questions.length} questions ({questions.filter((q) => q.tags.includes('core')).length} must know)</span>}
          {problems.length > 0 && <span>{problems.length} coding problems</span>}
          {total > 0 && <span>{rated} of {total} rated</span>}
        </p>
      )}
      <Markdown src={doc.intro} className="md prose" />
      {doc.sections.length > 2 && (
        <nav className="onpage" aria-label="In this chapter">
          {doc.sections.map((s) => (
            <a key={s.title} href={hrefFor(chapter.id, `s-${slug(s.title)}`)} className="chip-btn">
              <Title text={s.title} as="span" />
            </a>
          ))}
        </nav>
      )}
      {doc.sections.map((s) => (
        <SectionBlock key={s.title} chapterId={chapter.id} section={s} />
      ))}
    </>
  );
}

function Anchored({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  const { ref } = useAnchorTarget<HTMLElement>(name);
  return (
    <section ref={ref} id={name} className="ch-section">
      <h2 dangerouslySetInnerHTML={{ __html: inlineHtml(title) }} />
      {children}
    </section>
  );
}

function SectionBlock({ chapterId, section }: { chapterId: string; section: Section }) {
  const name = `s-${slug(section.title)}`;
  if (section.kind === 'prose') {
    return (
      <Anchored name={name} title={section.title}>
        <Markdown src={section.body} className="md prose" />
      </Anchored>
    );
  }
  if (section.kind === 'questions') return <QuestionsBlock chapterId={chapterId} name={name} section={section} />;
  return (
    <Anchored name={name} title={section.title}>
      <Markdown src={section.intro} className="md prose" />
      {section.problems.map((p, i) => (
        <ProblemCard key={p.id} chapterId={chapterId} p={p} n={i + 1} />
      ))}
    </Anchored>
  );
}

function QuestionsBlock({ chapterId, name, section }: { chapterId: string; name: string; section: Extract<Section, { kind: 'questions' }> }) {
  const [openAll, setOpenAll] = useState(false);
  const [coreOnly, setCoreOnly] = useState(false);
  const list = section.questions.map((q, i) => ({ q, n: i + 1 })).filter(({ q }) => !coreOnly || q.tags.includes('core'));
  return (
    <Anchored name={name} title={section.title}>
      <Markdown src={section.intro} className="md prose" />
      <div className="qbar">
        <p className="qbar-tip">Say your answer out loud first, then reveal the model answer and rate yourself.</p>
        <label className="chk">
          <input type="checkbox" checked={coreOnly} onChange={(e) => setCoreOnly(e.target.checked)} /> Must know only
        </label>
        <label className="chk">
          <input type="checkbox" checked={openAll} onChange={(e) => setOpenAll(e.target.checked)} /> Show all answers
        </label>
      </div>
      {list.map(({ q, n }) => (
        <QuestionCard key={q.id} chapterId={chapterId} q={q} n={n} open={openAll} />
      ))}
    </Anchored>
  );
}
