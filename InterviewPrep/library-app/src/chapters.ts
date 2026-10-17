import { parseDoc, problemsOf, questionsOf, type Doc } from './lib/md';
import { TRACKS, type Track } from './tracks';

// The library: every chapter belongs to exactly one tech stack, so a topic is written once and reused by every
// job description. Tracks (src/tracks.ts) pick chapters from here and add their own plan and stories chapters.

export type StackId =
  | 'python'
  | 'react'
  | 'backend'
  | 'node'
  | 'messaging'
  | 'data'
  | 'realtime'
  | 'testing'
  | 'security'
  | 'cloud'
  | 'ml'
  | 'genai'
  | 'healthcare'
  | 'design'
  | 'code-ts'
  | 'code-py';

export type Stack = { id: StackId; title: string; blurb: string; coding: boolean; chapters: string[] };

export const STACKS: Stack[] = [
  { id: 'python', title: 'Python', coding: false, blurb: 'The language itself: data model, collections, functions, OOP, errors, concurrency, typing and testing.',
    chapters: ['py-data-model', 'py-collections', 'py-functions', 'py-iterators', 'py-oop', 'py-errors', 'py-concurrency', 'py-typing-pydantic', 'py-testing'] },
  { id: 'react', title: 'React and TypeScript', coding: false, blurb: 'React 19, hooks, state and client caching, performance, TypeScript, accessibility and responsive UI.',
    chapters: ['react-core', 'react-hooks', 'react-state', 'react-performance', 'typescript', 'a11y-ui'] },
  { id: 'backend', title: 'Backend services', coding: false, blurb: 'FastAPI services, API design, queues, state machines, microservices and enterprise integration.',
    chapters: ['fastapi', 'api-design', 'task-queues', 'state-machines', 'microservices', 'enterprise-integration'] },
  { id: 'node', title: 'Node.js', coding: false, blurb: 'The Node.js runtime: event loop and async, buffers and streams, HTTP APIs with Express, and running Node in production.',
    chapters: ['node-core', 'node-streams', 'node-apis', 'node-production'] },
  { id: 'data', title: 'Data', coding: false, blurb: 'SQL, PostgreSQL, SQLAlchemy, Firestore and Redis: schemas, queries, transactions and caching.',
    chapters: ['sql', 'postgres', 'sqlalchemy', 'firestore', 'redis'] },
  { id: 'messaging', title: 'Messaging and streaming', coding: false, blurb: 'Apache Kafka and RabbitMQ: event logs and queues, delivery guarantees, patterns and operations.',
    chapters: ['kafka-core', 'kafka-practice', 'rabbitmq-core', 'rabbitmq-practice'] },
  { id: 'realtime', title: 'Real-time streaming', coding: false, blurb: 'SSE, WebSockets and gRPC streaming, streaming chat UIs, live dashboards and a runnable demo.',
    chapters: ['sse', 'websockets', 'grpc', 'streaming-chat-ui', 'realtime-dashboards', 'streaming-project'] },
  { id: 'testing', title: 'Testing', coding: false, blurb: 'Unit, integration, contract and end-to-end testing across the stack, with Playwright.',
    chapters: ['testing', 'playwright'] },
  { id: 'security', title: 'Security and identity', coding: false, blurb: 'OAuth, OIDC, SAML, JWT and role-based access, plus OWASP web and LLM application security.',
    chapters: ['auth-identity', 'web-security'] },
  { id: 'cloud', title: 'Cloud and DevOps', coding: false, blurb: 'Docker and Kubernetes, AWS/Azure/GCP services, Cloud Run, CI/CD and Terraform.',
    chapters: ['docker-k8s', 'cloud-platforms', 'cloud-run', 'gcp-services', 'cicd-terraform'] },
  { id: 'ml', title: 'Machine learning', coding: false, blurb: 'Classical ML from zero: the lifecycle, metrics, features, neural networks and MLOps.',
    chapters: ['ml-fundamentals', 'ml-metrics', 'ml-features', 'ml-deep-learning', 'mlops'] },
  { id: 'genai', title: 'Generative AI', coding: false, blurb: 'LLM APIs and fundamentals, retrieval-augmented generation, agents and agent frameworks.',
    chapters: ['llm-apps', 'rag', 'agents'] },
  { id: 'healthcare', title: 'Healthcare domain', coding: false, blurb: 'HIPAA and PHI, HL7 v2 and FHIR, payer, provider and life-sciences workflows.',
    chapters: ['hipaa', 'fhir-hl7', 'payer-workflows'] },
  { id: 'design', title: 'System design', coding: false, blurb: 'A framework for the design round, with worked designs for agent platforms and healthcare AI.',
    chapters: ['system-design', 'design-cases', 'design-cases-healthcare'] },
  { id: 'code-ts', title: 'Live coding · TypeScript and React', coding: true, blurb: 'JS/TS toolkit, async problems, practical tasks, live React components and algorithms in TypeScript.',
    chapters: ['code-ts-toolkit', 'code-async', 'code-practical-ts', 'code-react-live', 'code-algo-arrays', 'code-algo-graphs'] },
  { id: 'code-py', title: 'Live coding · Python', coding: true, blurb: 'Python toolkit, classic algorithm patterns, practical backend tasks, and pandas.',
    chapters: ['code-toolkit', 'code-arrays-strings', 'code-hashing', 'code-two-pointers-window', 'code-stacks-queues', 'code-linked-trees', 'code-recursion-dp', 'code-python', 'code-pandas'] },
];

export type ChapterKind = 'topic' | 'coding' | 'track';

export type Chapter = {
  id: string; // also the URL (#/<id>) and the file content/<id>.md
  num: string; // position inside its stack ("03"), or A/B/C for a track's own chapters
  kind: ChapterKind;
  group: string; // the stack title, or "Start here" for a track's own chapters
  stack?: StackId;
  track?: Track['id'];
  title: string;
  goal: string;
  minutes: number;
  doc: Doc;
};

// Every chapter's Markdown is bundled up front: the drill and the mock interview need all of it.
const files = import.meta.glob<string>('../content/*.md', { query: '?raw', import: 'default', eager: true });
const sourceOf = (id: string) => files[`../content/${id}.md`];

export const CONTENT_IDS = Object.keys(files).map((p) => p.replace(/^.*\/(.*)\.md$/, '$1'));

const placeholder = (id: string): Doc => ({
  front: { title: id, goal: 'This chapter is still being written.', minutes: 0 },
  intro: 'This chapter is still being written. Check back shortly.',
  sections: [],
});

function make(id: string, num: string, kind: ChapterKind, group: string, extra: Partial<Chapter>): Chapter {
  const raw = sourceOf(id);
  const doc = raw ? parseDoc(raw) : placeholder(id);
  return { id, num, kind, group, title: doc.front.title, goal: doc.front.goal, minutes: doc.front.minutes, doc, ...extra };
}

export const LIBRARY: Chapter[] = STACKS.flatMap((s) =>
  s.chapters.map((id, i) => make(id, String(i + 1).padStart(2, '0'), s.coding ? 'coding' : 'topic', s.title, { stack: s.id })),
);

export const TRACK_CHAPTERS: Chapter[] = TRACKS.flatMap((t) =>
  t.start.map((id, i) => make(id, String.fromCharCode(65 + i), 'track', 'Start here', { track: t.id })),
);

export const CHAPTERS: Chapter[] = [...TRACK_CHAPTERS, ...LIBRARY];
export const REGISTERED_IDS = CHAPTERS.map((c) => c.id);
export const findChapter = (id: string) => CHAPTERS.find((c) => c.id === id);
export const findStack = (id: string) => STACKS.find((s) => s.id === id);

// Old links keep working: chapters that were merged or renamed when the two labs became one library.
export const ALIASES: Record<string, string> = {
  'fastapi-async': 'fastapi',
  'agent-frameworks': 'agents',
  'llm-basics': 'llm-apps',
  'gke-docker': 'docker-k8s',
  'code-react': 'code-react-live',
  'code-practical': 'code-python',
  'react-typescript': 'typescript',
  'api-security': 'api-design',
  'cloud-cicd': 'cloud-platforms',
  'node-backend': 'node-core',
};

/** A track's own chapters can be reached by their generic names, resolved against the active track. */
export const TRACK_SLOTS = ['welcome', 'coding-round', 'stories'] as const;

export type PracticePage = { id: string; title: string; goal: string };
export const PRACTICE_PAGES: PracticePage[] = [
  { id: 'mock', title: 'Mock interview', goal: 'A timed round for the selected track: an opening question, technical questions weighted by its JD, then live coding.' },
  { id: 'drill', title: 'Flash-card drill', goal: 'Interview questions as flash cards, for your track, one tech stack or the whole library. Say it out loud, reveal, rate.' },
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
