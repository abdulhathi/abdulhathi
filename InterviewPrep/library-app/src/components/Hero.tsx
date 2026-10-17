import { ALL_PROBLEMS, ALL_QUESTIONS, CHAPTERS, TESTED_BLOCKS } from '../chapters';

export function Hero() {
  const topics = CHAPTERS.filter((c) => c.group !== 'Start here');
  const core = ALL_QUESTIONS.filter((x) => x.q.tags.includes('core')).length;
  return (
    <header className="hero">
      <p className="kicker">Capgemini · Sr. Full Stack Engineer · Agentic AI platform on Google Cloud</p>
      <h1>Walk into the interview ready for every question</h1>
      <p className="lede">
        Built from the job description and your resume. It covers real-time streaming (SSE, WebSockets, gRPC), React and
        TypeScript, Python and Node.js services, task queues and state machines, PostgreSQL, Firestore and Redis, testing,
        enterprise identity, GCP and agent frameworks. Every question has an answer to say out loud, and every piece of code
        in the lab has been run or type-checked.
      </p>
      <dl className="facts">
        <div><dt>Chapters</dt><dd>{topics.length} topics in {new Set(topics.map((c) => c.group)).size} groups</dd></div>
        <div><dt>Interview questions</dt><dd>{ALL_QUESTIONS.length}, of which {core} are must know</dd></div>
        <div><dt>Coding problems</dt><dd>{ALL_PROBLEMS.length}, with layered hints and tested solutions</dd></div>
        <div><dt>Code checked</dt><dd>{TESTED_BLOCKS} blocks run or type-checked</dd></div>
      </dl>
    </header>
  );
}
