import { ALL_PROBLEMS, ALL_QUESTIONS, CHAPTERS, TESTED_BLOCKS } from '../chapters';

export function Hero() {
  const topics = CHAPTERS.filter((c) => c.group !== 'Start here');
  const core = ALL_QUESTIONS.filter((x) => x.q.tags.includes('core')).length;
  const pythonProblems = ALL_PROBLEMS.filter((x) => x.chapter.id !== 'code-react').length;
  return (
    <header className="hero">
      <p className="kicker">CitiusTech · Full Stack Python Developer (Python &amp; AI Engineer) · Healthcare</p>
      <h1>Walk into the interview ready for every question</h1>
      <p className="lede">
        Built from the job description and your resume. It covers the three mandatory skills (Python, React and healthcare),
        the live-coding round, and the ML and GenAI responsibilities. Every question comes with an answer to say out loud,
        and every piece of code in the lab has been run.
      </p>
      <dl className="facts">
        <div><dt>Chapters</dt><dd>{topics.length} topics in {new Set(topics.map((c) => c.group)).size} groups</dd></div>
        <div><dt>Interview questions</dt><dd>{ALL_QUESTIONS.length}, of which {core} are must know</dd></div>
        <div><dt>Coding problems</dt><dd>{ALL_PROBLEMS.length} ({pythonProblems} in Python, with hints and solutions)</dd></div>
        <div><dt>Code checked</dt><dd>{TESTED_BLOCKS} blocks run or type-checked</dd></div>
      </dl>
    </header>
  );
}
