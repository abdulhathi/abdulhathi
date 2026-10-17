import { parseDoc, problemsOf, questionsOf, type Doc } from './lib/md';

export type Group =
  | 'Start here'
  | 'Real-time streaming'
  | 'React and TypeScript'
  | 'Backend services'
  | 'Data'
  | 'Testing'
  | 'Live coding'
  | 'Security and identity'
  | 'GCP and delivery'
  | 'Agentic AI'
  | 'System design';

// Tier 1 = the JD's required qualifications and the coding round, 2 = other responsibilities, 3 = nice to have.
export type Tier = 0 | 1 | 2 | 3;

export type Chapter = {
  id: string; // also the URL (#/<id>) and the file content/<id>.md
  num: string;
  group: Group;
  tier: Tier;
  title: string;
  goal: string;
  minutes: number;
  doc: Doc;
};

const GROUPS: [Group, Tier, string[]][] = [
  ['Start here', 0, ['welcome', 'coding-round', 'stories']],
  ['Real-time streaming', 1, ['sse', 'websockets', 'grpc', 'streaming-chat-ui', 'realtime-dashboards', 'streaming-project']],
  ['React and TypeScript', 1, ['react-core', 'react-hooks', 'react-state', 'react-performance', 'typescript', 'a11y-ui']],
  ['Backend services', 1, ['node-backend', 'fastapi-async', 'api-design', 'task-queues', 'state-machines', 'microservices']],
  ['Data', 1, ['postgres', 'firestore', 'redis']],
  ['Testing', 1, ['testing', 'playwright']],
  ['Live coding', 1, ['code-ts-toolkit', 'code-async', 'code-practical-ts', 'code-react-live', 'code-algo-arrays', 'code-algo-graphs', 'code-python']],
  ['Security and identity', 2, ['auth-identity', 'web-security']],
  ['GCP and delivery', 2, ['cloud-run', 'gke-docker', 'gcp-services', 'cicd-terraform']],
  ['Agentic AI', 3, ['llm-apps', 'agent-frameworks', 'enterprise-integration']],
  ['System design', 2, ['system-design', 'design-cases']],
];

// Every chapter's Markdown is bundled up front: the drill and the mock interview need all of it.
const files = import.meta.glob<string>('../content/*.md', { query: '?raw', import: 'default', eager: true });
const sourceOf = (id: string) => files[`../content/${id}.md`];

export const CONTENT_IDS = Object.keys(files).map((p) => p.replace(/^.*\/(.*)\.md$/, '$1'));

const placeholder = (id: string): Doc => ({
  front: { title: id, goal: 'This chapter is still being written.', minutes: 0 },
  intro: 'This chapter is still being written. Check back shortly.',
  sections: [],
});

let n = 0;
export const CHAPTERS: Chapter[] = GROUPS.flatMap(([group, tier, ids]) =>
  ids.map((id) => {
    const raw = sourceOf(id);
    const doc = raw ? parseDoc(raw) : placeholder(id);
    const num = group === 'Start here' ? String.fromCharCode(65 + ids.indexOf(id)) : String(++n).padStart(2, '0');
    return { id, num, group, tier, title: doc.front.title, goal: doc.front.goal, minutes: doc.front.minutes, doc };
  }),
);

export const REGISTERED_IDS = GROUPS.flatMap(([, , ids]) => ids);
export const findChapter = (id: string) => CHAPTERS.find((c) => c.id === id);

export type PracticePage = { id: string; title: string; goal: string };
export const PRACTICE_PAGES: PracticePage[] = [
  { id: 'mock', title: 'Mock interview', goal: 'A timed round: an opening question, technical questions weighted by the JD, then live coding in TypeScript, React or Python.' },
  { id: 'drill', title: 'Flash-card drill', goal: 'Every interview question in the lab as a flash card. Say your answer out loud, reveal, and rate yourself.' },
  { id: 'progress', title: 'Weak spots', goal: 'Every question and problem you marked shaky or missed, so your last hour goes where it matters.' },
];

/** Every question and problem with the chapter it belongs to, for the drill and the mock interview. */
export const ALL_QUESTIONS = CHAPTERS.flatMap((c) => questionsOf(c.doc).map((q) => ({ chapter: c, q, key: `${c.id}/${q.id}` })));
export const ALL_PROBLEMS = CHAPTERS.flatMap((c) => problemsOf(c.doc).map((p) => ({ chapter: c, p, key: `${c.id}/${p.id}` })));

/** Code blocks that scripts/check-code.mjs executes or type-checks (everything except norun fragments). */
export const TESTED_BLOCKS = Object.values(files).reduce(
  (n, raw) => n + (raw.match(/^\s*```(python|ts|tsx|sql)(?![^\n]*\bnorun\b)[^\n]*$/gm)?.length ?? 0),
  0,
);
