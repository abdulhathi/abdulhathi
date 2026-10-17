import type { StackId } from './chapters';

// A track is one job description: which library chapters matter for it, how much, and why, plus the track's own
// chapters (study plan, coding round, stories) and how its mock interview is built.
// To add a JD: add a track here, write its three content/<track>-*.md chapters, and add chapters only for stacks
// the library does not cover yet.

export type Priority = 'must' | 'review' | 'optional';
export const PRIORITY_LABEL: Record<Priority, string> = { must: 'Must study', review: 'Review', optional: 'Optional' };

/** [chapter id, priority, why it matters for this JD (optional)] */
export type PlanItem = readonly [id: string, priority: Priority, why?: string];

export type MockFormat = { label: string; coding: number };

export type Track = {
  id: 'capgemini' | 'citiustech';
  company: string;
  role: string;
  context: string;
  status: string;
  /** The track's own chapters, in order: study plan, coding round, stories. Their ids start with the track id. */
  start: [welcome: string, codingRound: string, stories: string];
  plan: PlanItem[];
  mock: {
    formats: Record<string, MockFormat>;
    /** How technical questions are spread across stacks. */
    weights: Partial<Record<StackId, number>>;
    /** Chapters the coding problems come from. */
    coding: string[];
    /** Open the coding part with a problem from this chapter when there is room (a React task for front-end roles). */
    first?: string;
    note: string;
    closing: string;
  };
};

export const TRACKS: Track[] = [
  {
    id: 'capgemini',
    company: 'Capgemini',
    role: 'Sr. Full Stack Engineer',
    context: 'Enterprise agentic AI platform on Google Cloud: streaming chat UIs, live dashboards, orchestration services.',
    status: 'Submitted 2026-10-14; interview date not set',
    start: ['capgemini-welcome', 'capgemini-coding-round', 'capgemini-stories'],
    plan: [
      ['sse', 'must', 'Required: proven client-server streaming. The main gap on your resume.'],
      ['websockets', 'must', 'Required streaming protocol; approve and cancel during agent runs.'],
      ['streaming-chat-ui', 'must', 'The core front-end responsibility: chat interfaces that stream LLM responses.'],
      ['streaming-project', 'must', 'Run it so you can talk about streaming from experience.'],
      ['react-state', 'must', 'Required: state management and client-side caching.'],
      ['react-hooks', 'must', 'Required: 8+ years of modern React.'],
      ['typescript', 'must', 'Required: React with TypeScript.'],
      ['task-queues', 'must', 'Responsibility: async task queues coordinating agent workflows.'],
      ['state-machines', 'must', 'Responsibility: resilient state machines for autonomous agent runs.'],
      ['api-design', 'must', 'Required: modular design and clean API contracts.'],
      ['postgres', 'must', 'Required: PostgreSQL / Cloud SQL schemas and queries.'],
      ['redis', 'must', 'Required: Firestore or Redis. Redis is a gap on your resume.'],
      ['testing', 'must', 'Required: unit, integration and end-to-end tests.'],
      ['playwright', 'must', 'Named in the JD; your resume has Cypress.'],
      ['code-async', 'must', 'The most likely live-coding style for a front-end-heavy role.'],
      ['code-react-live', 'must', 'A live React component is a likely coding task.'],
      ['grpc', 'review', 'Named in the JD: REST and gRPC APIs, gRPC streaming.'],
      ['realtime-dashboards', 'review', 'Responsibility: dashboards for pipeline progress, logs and telemetry.'],
      ['react-core', 'review'],
      ['react-performance', 'review'],
      ['a11y-ui', 'review', 'The JD requires strict accessibility standards.'],
      ['fastapi', 'review', 'Backend services in Python.'],
      ['node-core', 'review', 'Backend services in Node.js: the runtime and async model.'],
      ['node-apis', 'review', 'Node.js HTTP APIs with Express, validation and tests.'],
      ['node-production', 'optional', 'Running Node.js services in production.'],
      ['microservices', 'review', 'Required: microservices and async workers.'],
      ['firestore', 'review', 'Firestore is named for the document tier.'],
      ['auth-identity', 'review', 'Responsibility: SAML / OAuth / OIDC and role-based access.'],
      ['web-security', 'review', 'Enterprise security standards, plus LLM-specific risks.'],
      ['cloud-run', 'review', 'Deploy to Cloud Run; you have done this at Quantiphi.'],
      ['docker-k8s', 'review', 'Docker, and GKE as well as Cloud Run.'],
      ['gcp-services', 'review', 'Nice to have: Secret Manager and Pub/Sub.'],
      ['cicd-terraform', 'review', 'Nice to have: Terraform triggered from webhooks or orchestrators.'],
      ['llm-apps', 'review', 'Nice to have: LLM runtimes.'],
      ['agents', 'review', 'Nice to have: LangChain, LangGraph or custom agent engines.'],
      ['sql', 'review', 'SQL fundamentals: indexes, isolation, window functions and query tasks.'],
      ['system-design', 'review'],
      ['design-cases', 'review', 'Worked designs of this kind of platform.'],
      ['code-ts-toolkit', 'review'],
      ['code-practical-ts', 'review'],
      ['code-algo-arrays', 'review'],
      ['code-algo-graphs', 'review'],
      ['code-python', 'review', 'In case the coding round is in Python.'],
      ['enterprise-integration', 'optional', 'Nice to have: ERP and SAP APIs.'],
      ['py-concurrency', 'optional', 'asyncio depth for the Python services.'],
      ['py-typing-pydantic', 'optional', 'Pydantic contracts, which you used at Quantiphi.'],
      ['rag', 'optional'],
      ['cloud-platforms', 'optional'],
    ],
    mock: {
      formats: {
        coding: { label: 'Coding heavy: 60% coding, the rest technical questions', coding: 0.6 },
        balanced: { label: 'Balanced: 40% coding, 60% technical questions', coding: 0.4 },
        discussion: { label: 'Technical deep dive: 25% coding, 75% questions', coding: 0.25 },
      },
      weights: { realtime: 5, react: 5, backend: 4, node: 2, data: 3, testing: 2, security: 2, cloud: 2, genai: 2, design: 2 },
      coding: ['code-ts-toolkit', 'code-async', 'code-practical-ts', 'code-react-live', 'code-algo-arrays', 'code-algo-graphs', 'code-python'],
      first: 'code-react-live',
      note:
        'The split between coding and questions is not known yet, so practise all three formats. Technical questions lean towards the JD\'s required skills (streaming and React most), then live coding: a React task when there is time, then TypeScript, async or Python problems.',
      closing:
        'Ask your questions: whether the streaming layer uses SSE, WebSockets or gRPC today, how agent runs are orchestrated, how the team splits front-end and back-end work, and what the first 90 days look like.',
    },
  },
  {
    id: 'citiustech',
    company: 'CitiusTech',
    role: 'Full Stack Python Developer (Python & AI Engineer)',
    context: 'Healthcare technology: Python, React and healthcare are mandatory; the JD adds building and deploying ML models.',
    status: 'Interviewed 2026-10-13',
    start: ['citiustech-welcome', 'citiustech-coding-round', 'citiustech-stories'],
    plan: [
      ['py-data-model', 'must', 'Mandatory skill: Python.'],
      ['py-collections', 'must'],
      ['py-functions', 'must'],
      ['py-iterators', 'must'],
      ['py-oop', 'must'],
      ['py-concurrency', 'must'],
      ['py-typing-pydantic', 'must', 'Your structured-output validation gate at Quantiphi.'],
      ['fastapi', 'must', '"Scalable applications using Python."'],
      ['sql', 'must'],
      ['react-core', 'must', 'Mandatory skill: React.'],
      ['react-hooks', 'must'],
      ['hipaa', 'must', 'Mandatory skill: healthcare.'],
      ['fhir-hl7', 'must'],
      ['payer-workflows', 'must'],
      ['ml-fundamentals', 'must', 'Responsibility: build, train and evaluate ML models. The gap on your resume.'],
      ['ml-metrics', 'must'],
      ['code-toolkit', 'must', 'Live coding is 30–60% of the round, in Python.'],
      ['code-hashing', 'must'],
      ['code-python', 'must'],
      ['py-errors', 'review'],
      ['py-testing', 'review'],
      ['sqlalchemy', 'review'],
      ['postgres', 'review', 'PostgreSQL specifics: MVCC, JSONB, locking and tuning.'],
      ['api-design', 'review'],
      ['auth-identity', 'review'],
      ['react-state', 'review'],
      ['react-performance', 'review'],
      ['typescript', 'review'],
      ['ml-features', 'review', 'Responsibility: feature engineering.'],
      ['ml-deep-learning', 'review'],
      ['mlops', 'review', 'Responsibility: data pipelines and deploying models.'],
      ['llm-apps', 'review', 'AI-driven solutions: your strongest area.'],
      ['rag', 'review'],
      ['agents', 'review'],
      ['docker-k8s', 'review'],
      ['cloud-platforms', 'review'],
      ['cicd-terraform', 'review'],
      ['system-design', 'review'],
      ['design-cases-healthcare', 'review'],
      ['code-arrays-strings', 'review'],
      ['code-two-pointers-window', 'review'],
      ['code-stacks-queues', 'review'],
      ['code-linked-trees', 'review'],
      ['code-recursion-dp', 'review'],
      ['code-pandas', 'review', 'A data-wrangling task is possible for an AI-engineer role.'],
      ['code-react-live', 'review'],
      ['web-security', 'optional'],
      ['testing', 'optional'],
      ['a11y-ui', 'optional'],
    ],
    mock: {
      formats: {
        coding: { label: '60% coding, 40% technical questions', coding: 0.6 },
        discussion: { label: '30% coding, 60% technical questions', coding: 0.3 },
      },
      weights: { python: 5, backend: 2, data: 2, react: 3, healthcare: 3, ml: 3, genai: 2, cloud: 1, design: 1 },
      coding: ['code-toolkit', 'code-arrays-strings', 'code-hashing', 'code-two-pointers-window', 'code-stacks-queues', 'code-linked-trees', 'code-recursion-dp', 'code-python', 'code-pandas'],
      note:
        'The recruiter said the round is sometimes 30% coding and 60% technical questions, and sometimes 60% coding. Technical questions are spread across the JD\'s skills; coding problems are in Python.',
      closing:
        'Ask your questions: how much of the work is model building and how much is full-stack Python and React, who the end client and team are, and what the first 90 days look like.',
    },
  },
];

export const findTrack = (id: string | null | undefined) => TRACKS.find((t) => t.id === id);
