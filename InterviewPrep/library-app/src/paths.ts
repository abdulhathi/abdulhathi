// Learning paths: one per technology. Each path takes you through five steps:
//   1. read the library chapters, 2. answer the interview questions out loud (scored), 3. take a short course,
//   4. build a GitHub portfolio project, 5. earn an online assessment or certificate for your profile.
// Courses, practice sites and assessments live in src/paths/<id>.json (researched and dated);
// project briefs live in projects/<id>.md.

export type Course = {
  title: string;
  provider: string; // "LinkedIn Learning" first; others when LinkedIn has nothing short and current
  url: string;
  duration: string; // as the provider states it, e.g. "1h 52m"
  level?: string;
  updated?: string; // when the course was released or last updated, as the provider states it
  why: string; // why this course, for this path
};

export type Portal = { name: string; url: string; what: string };

export type Assessment = {
  name: string;
  provider: string;
  url: string;
  cost: string; // "Free", "$150", …
  format: string; // e.g. "90-minute proctored online test, 2 coding tasks"
  credential: string; // what you get: shareable certificate URL, badge, …
  why: string;
};

export type PathResources = { checked: string; courses: Course[]; portals: Portal[]; assessments: Assessment[] };

export type LearningPath = {
  id: string;
  title: string;
  blurb: string;
  /** Library chapters to read, in order. Their interview questions are the voice-practice deck. */
  chapters: string[];
  /** Extra chapters whose coding problems are the hands-on practice for this path. */
  coding?: string[];
  /** A separate hands-on course in the portfolio, if there is one. */
  lab?: { name: string; url: string };
};

export const PATHS: LearningPath[] = [
  { id: 'python', title: 'Python', blurb: 'The language in depth: data model, collections, functions, OOP, errors, concurrency, typing and testing.',
    chapters: ['py-data-model', 'py-collections', 'py-functions', 'py-iterators', 'py-oop', 'py-errors', 'py-concurrency', 'py-typing-pydantic', 'py-testing'],
    coding: ['code-toolkit', 'code-python'] },
  { id: 'nodejs', title: 'Node.js', blurb: 'The runtime and event loop, streams, HTTP APIs with Express, and Node.js in production.',
    chapters: ['node-core', 'node-streams', 'node-apis', 'node-production'],
    coding: ['code-async', 'code-practical-ts'],
    lab: { name: 'Node.js Lab (build-it course)', url: 'http://localhost:5181' } },
  { id: 'typescript', title: 'JavaScript and TypeScript', blurb: 'The type system, runtime validation, async JavaScript and the language traps interviewers probe.',
    chapters: ['typescript', 'code-ts-toolkit', 'code-async'],
    coding: ['code-ts-toolkit', 'code-async', 'code-practical-ts'] },
  { id: 'react', title: 'React', blurb: 'React 19, hooks, state and client caching, performance, accessibility, and live component tasks.',
    chapters: ['react-core', 'react-hooks', 'react-state', 'react-performance', 'a11y-ui'],
    coding: ['code-react-live'] },
  { id: 'fastapi', title: 'FastAPI and Python APIs', blurb: 'FastAPI services, Pydantic contracts, API design and data access with SQLAlchemy.',
    chapters: ['fastapi', 'py-typing-pydantic', 'api-design', 'sqlalchemy'],
    coding: ['code-python'] },
  { id: 'sql', title: 'SQL and PostgreSQL', blurb: 'Queries, indexes, transactions and isolation, then PostgreSQL specifics and Cloud SQL.',
    chapters: ['sql', 'postgres'] },
  { id: 'redis', title: 'Redis', blurb: 'Data structures, caching patterns, rate limiting, pub/sub and Streams, persistence and Memorystore.',
    chapters: ['redis'] },
  { id: 'kafka', title: 'Apache Kafka', blurb: 'The distributed log: partitions, replication, producers and consumer groups, delivery guarantees and operations.',
    chapters: ['kafka-core', 'kafka-practice'] },
  { id: 'rabbitmq', title: 'RabbitMQ', blurb: 'AMQP exchanges and queues, acknowledgements and reliability, messaging patterns and operations.',
    chapters: ['rabbitmq-core', 'rabbitmq-practice'],
    lab: { name: 'RabbitMQ tutorial (build ShopFlow)', url: 'http://localhost:5187' } },
  { id: 'realtime', title: 'Real-time streaming', blurb: 'SSE, WebSockets and gRPC streaming, streaming chat UIs and live dashboards.',
    chapters: ['sse', 'websockets', 'grpc', 'streaming-chat-ui', 'realtime-dashboards', 'streaming-project'] },
  { id: 'docker-k8s', title: 'Docker and Kubernetes', blurb: 'Images and Dockerfiles, Kubernetes workloads, probes and scaling, AKS and GKE.',
    chapters: ['docker-k8s'] },
  { id: 'cloud', title: 'Cloud and CI/CD', blurb: 'AWS, Azure and GCP services, Cloud Run, the GCP platform services, CI/CD and Terraform.',
    chapters: ['cloud-platforms', 'cloud-run', 'gcp-services', 'cicd-terraform'] },
  { id: 'system-design', title: 'System design', blurb: 'A framework for the design round, microservices and resilience, and worked designs.',
    chapters: ['system-design', 'microservices', 'design-cases', 'design-cases-healthcare'] },
  { id: 'genai', title: 'Generative AI and agents', blurb: 'LLM fundamentals and APIs, retrieval-augmented generation, agents and agent frameworks.',
    chapters: ['llm-apps', 'rag', 'agents'] },
  { id: 'ml', title: 'Machine learning', blurb: 'Classical ML from zero: the lifecycle, metrics, feature engineering, neural networks and MLOps.',
    chapters: ['ml-fundamentals', 'ml-metrics', 'ml-features', 'ml-deep-learning', 'mlops'],
    coding: ['code-pandas'] },
  { id: 'security', title: 'Security and identity', blurb: 'OAuth, OIDC, SAML, JWT and access control, plus OWASP web, API and LLM security.',
    chapters: ['auth-identity', 'web-security'] },
  { id: 'testing', title: 'Testing', blurb: 'Unit, integration and contract tests across the stack, pytest, and end-to-end testing with Playwright.',
    chapters: ['testing', 'py-testing', 'playwright'] },
  { id: 'dsa', title: 'Data structures and algorithms', blurb: 'The classic problem patterns in TypeScript and Python, for online assessments and coding rounds.',
    chapters: ['code-algo-arrays', 'code-algo-graphs', 'code-hashing', 'code-two-pointers-window', 'code-recursion-dp'],
    coding: ['code-algo-arrays', 'code-algo-graphs', 'code-arrays-strings', 'code-hashing', 'code-two-pointers-window', 'code-stacks-queues', 'code-linked-trees', 'code-recursion-dp'],
    lab: { name: 'DSA Lab (every LeetCode pattern)', url: 'http://localhost:5182' } },
];

export const findPath = (id: string) => PATHS.find((p) => p.id === id);

// Researched resources and project briefs, bundled at build time.
const resourceFiles = import.meta.glob<PathResources>('./paths/*.json', { eager: true, import: 'default' });
const projectFiles = import.meta.glob<string>('../projects/*.md', { query: '?raw', import: 'default', eager: true });

export const EMPTY_RESOURCES: PathResources = { checked: '', courses: [], portals: [], assessments: [] };
export const resourcesFor = (id: string): PathResources => resourceFiles[`./paths/${id}.json`] ?? EMPTY_RESOURCES;

export type ProjectBrief = { title: string; summary: string; time: string; body: string; sections: Record<string, string> };

/** A project brief: front matter (title, summary, time) and its ## sections by title. */
export function projectFor(id: string): ProjectBrief | undefined {
  const raw = projectFiles[`../projects/${id}.md`];
  if (!raw) return undefined;
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const front: Record<string, string> = {};
  for (const line of (m?.[1] ?? '').split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) front[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
  const body = m ? raw.slice(m[0].length) : raw;
  const sections: Record<string, string> = {};
  for (const part of `\n${body}`.split(/\n## /).slice(1)) {
    const nl = part.indexOf('\n');
    sections[part.slice(0, nl).trim()] = part.slice(nl + 1).trim();
  }
  return { title: front.title ?? id, summary: front.summary ?? '', time: front.time ?? '', body, sections };
}
