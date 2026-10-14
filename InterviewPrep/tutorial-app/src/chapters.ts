import { parseDoc, problemsOf, questionsOf, type Doc } from './lib/md';

export type Group =
  | 'Start here'
  | 'Core Python'
  | 'Backend and data'
  | 'React'
  | 'Healthcare domain'
  | 'Live coding'
  | 'Machine learning'
  | 'Generative AI'
  | 'Platform and design';

// Tier 1 = mandatory skills and the coding round, 2 = the JD's ML responsibilities, 3 = GenAI, 4 = platform and design.
export type Tier = 0 | 1 | 2 | 3 | 4;

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
  ['Core Python', 1, ['py-data-model', 'py-collections', 'py-functions', 'py-iterators', 'py-oop', 'py-errors', 'py-concurrency', 'py-typing-pydantic', 'py-testing']],
  ['Backend and data', 1, ['fastapi', 'api-security', 'sql', 'sqlalchemy']],
  ['React', 1, ['react-core', 'react-hooks', 'react-performance', 'react-typescript']],
  ['Healthcare domain', 1, ['hipaa', 'fhir-hl7', 'payer-workflows']],
  ['Live coding', 1, ['code-toolkit', 'code-arrays-strings', 'code-hashing', 'code-two-pointers-window', 'code-stacks-queues', 'code-linked-trees', 'code-recursion-dp', 'code-practical', 'code-pandas', 'code-react']],
  ['Machine learning', 2, ['ml-fundamentals', 'ml-metrics', 'ml-features', 'ml-deep-learning', 'mlops']],
  ['Generative AI', 3, ['llm-basics', 'rag', 'agents']],
  ['Platform and design', 4, ['docker-k8s', 'cloud-cicd', 'system-design']],
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
  { id: 'mock', title: 'Mock interview', goal: 'A timed round in the format the recruiter described: 30% or 60% coding, the rest technical questions.' },
  { id: 'drill', title: 'Flash-card drill', goal: 'Every interview question in the lab as a flash card. Say your answer out loud, reveal, and rate yourself.' },
  { id: 'progress', title: 'Weak spots', goal: 'Every question and problem you marked shaky or missed, so your last hour goes where it matters.' },
];

/** Every question and problem with the chapter it belongs to, for the drill and the mock interview. */
export const ALL_QUESTIONS = CHAPTERS.flatMap((c) => questionsOf(c.doc).map((q) => ({ chapter: c, q, key: `${c.id}/${q.id}` })));
export const ALL_PROBLEMS = CHAPTERS.flatMap((c) => problemsOf(c.doc).map((p) => ({ chapter: c, p, key: `${c.id}/${p.id}` })));

/** Code blocks that scripts/check-code.mjs executes or type-checks (everything except norun fragments). */
export const TESTED_BLOCKS = Object.values(files).reduce((n, raw) => n + (raw.match(/^\s*```(python|ts|tsx|sql)[ \t]*$/gm)?.length ?? 0), 0);
