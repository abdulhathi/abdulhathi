// Timed preparation plans shown on the Prep plan page (#/plan/<id>). Times are local to the plan's UTC offset.
// This file is public: describe roles by title and stack, never by staffing firm, recruiter, rate or end client.

/** A link from a block: a page of a hub app (opens in the hub's viewer), a path in an app opened in a new tab
 *  (for pages that need the microphone), or an outside URL. */
export type PlanLink =
  | { label: string; app: string; page?: string }
  | { label: string; app: string; path: string }
  | { label: string; url: string };

export type BlockKind = 'study' | 'practice' | 'break' | 'event' | 'test';

export type Block = {
  id: string;
  /** "HH:MM", 24-hour, in the plan's time zone. */
  start: string;
  end: string;
  title: string;
  kind: BlockKind;
  points?: string[];
  links?: PlanLink[];
};

export type PlanDay = { date: string; title: string; focus: string; blocks: Block[] };
export type Milestone = { id: string; label: string; at: string; note?: string };

export type Plan = {
  id: string;
  title: string;
  summary: string;
  /** For example "-07:00" (Pacific daylight time). */
  utcOffset: string;
  zoneLabel: string;
  milestones: Milestone[];
  notes: string[];
  days: PlanDay[];
};

const lib = (label: string, page: string): PlanLink => ({ label, app: 'library', page });
const voice = (label: string, scope: string): PlanLink => ({ label, app: 'library', path: `/#/interview/${scope}` });

export const PLANS: Plan[] = [
  {
    id: 'oct-19-frontend-genai-and-walmart',
    title: 'Frontend + GenAI interview and the Walmart assessment',
    summary:
      'Saturday closes the GenAI-in-the-UI gaps, Sunday sharpens Angular and React, Monday is the interview, and Monday evening and Tuesday prepare for and take the Walmart assessment.',
    utcOffset: '-07:00',
    zoneLabel: 'Pacific time',
    milestones: [
      { id: 'interview', label: 'Sr Frontend interview (React, Angular, GenAI)', at: '2026-10-19T13:00:00-07:00' },
      { id: 'walmart-test', label: 'Walmart assessment (planned)', at: '2026-10-20T20:00:00-07:00', note: '55–65 minutes, proctored, in Chrome' },
      { id: 'walmart-deadline', label: 'Walmart link expires', at: '2026-10-21T08:17:00-07:00', note: '11:17 AM Eastern' },
    ],
    notes: [
      'Monday and Tuesday blocks sit before 9 AM and after 6 PM in case you are at work. If you are free, add another timed live-coding round.',
      'If the Walmart test cannot happen on Tuesday evening, Wednesday 6:00–7:05 AM still beats the 8:17 AM deadline.',
      'Voice interview links open the library in a new tab, because the microphone does not work inside the hub viewer.',
    ],
    days: [
      {
        date: '2026-10-17',
        title: 'Saturday',
        focus: 'GenAI inside the UI: the gaps that set this role apart',
        blocks: [
          {
            id: 'sat-setup', start: '12:00', end: '12:15', title: 'Set up', kind: 'event',
            points: ['Start the Interview Library and the streaming demo from Study Hub.', 'Open this plan on a second screen or tab.'],
            links: [{ label: 'Streaming demo', app: 'streaming-client' }, lib('GenAI learning path', 'path-genai')],
          },
          {
            id: 'sat-streaming', start: '12:15', end: '13:30', title: 'Streaming LLM responses in the UI', kind: 'study',
            points: [
              'fetch() with a ReadableStream reader vs EventSource: when each fits (POST bodies, auth headers, reconnects).',
              'Render tokens as they arrive without re-rendering the whole list; keep the scroll pinned.',
              'A Stop button with AbortController; errors and retries mid-stream.',
              'Announce progress politely to screen readers (aria-live) without reading every token.',
            ],
            links: [lib('Streaming chat UI', 'streaming-chat-ui')],
          },
          { id: 'sat-lunch', start: '13:30', end: '14:15', title: 'Lunch', kind: 'break' },
          {
            id: 'sat-sse', start: '14:15', end: '15:15', title: 'SSE and the streaming demo, hands on', kind: 'practice',
            points: [
              'Run the demo, open the Network tab and watch the event stream.',
              'Find where the client parses events, where Stop aborts, and how an approval step pauses the run.',
            ],
            links: [lib('Server-sent events', 'sse'), lib('Streaming project', 'streaming-project'), { label: 'Streaming demo', app: 'streaming-client' }],
          },
          { id: 'sat-break-1', start: '15:15', end: '15:30', title: 'Break', kind: 'break' },
          {
            id: 'sat-llm', start: '15:30', end: '16:45', title: 'LLM APIs, prompt design and guardrails', kind: 'study',
            points: [
              'System prompts, few-shot examples, and asking for structured (JSON schema) output.',
              'Validate model output before showing or acting on it; fall back gracefully.',
              'Azure OpenAI vs Anthropic: deployments and api-version vs model names; streaming in both.',
              'API keys stay on the server (a backend-for-frontend), never in the browser.',
            ],
            links: [lib('LLM apps', 'llm-apps')],
          },
          { id: 'sat-break-2', start: '16:45', end: '17:00', title: 'Break', kind: 'break' },
          {
            id: 'sat-agents', start: '17:00', end: '18:15', title: 'Agents with a human in the loop', kind: 'study',
            points: [
              'The tool-calling loop: the model asks for a tool, your code runs it, the result goes back.',
              'Plan → step → approve → act: an approval screen and a timeline of every agent action.',
              'Pause and resume (LangGraph interrupts); limits on steps, cost and time.',
              'Semantic Kernel in two sentences: Microsoft’s SDK for plugins (tools), planning and agents in .NET, Python and Java.',
            ],
            links: [lib('Agents', 'agents'), { label: 'Semantic Kernel overview', url: 'https://learn.microsoft.com/en-us/semantic-kernel/overview/' }],
          },
          { id: 'sat-dinner', start: '18:15', end: '19:00', title: 'Dinner', kind: 'break' },
          {
            id: 'sat-rag', start: '19:00', end: '20:00', title: 'RAG for intelligent search', kind: 'study',
            points: ['Chunking, embeddings, vector and hybrid search, re-ranking.', 'Show citations in the UI; say “I don’t know” when retrieval finds nothing.', 'How you would evaluate answer quality.'],
            links: [lib('RAG', 'rag')],
          },
          {
            id: 'sat-security', start: '20:00', end: '20:45', title: 'AI security in the UI', kind: 'study',
            points: [
              'Prompt injection, direct and indirect (instructions hidden in retrieved documents).',
              'Data leakage: what is sent to the model, what is logged, who sees it.',
              'Unsafe rendering: sanitize model markdown (DOMPurify), no dangerouslySetInnerHTML or innerHTML, a strict CSP, care with links and images in output.',
            ],
            links: [lib('Web and LLM security', 'web-security'), lib('Streaming chat UI (safe rendering)', 'streaming-chat-ui')],
          },
          {
            id: 'sat-voice', start: '20:45', end: '21:30', title: 'Say it out loud: GenAI questions', kind: 'practice',
            points: ['Answer the GenAI questions with the voice interviewer until each one passes.'],
            links: [voice('Voice interview: Generative AI', 'genai')],
          },
        ],
      },
      {
        date: '2026-10-18',
        title: 'Sunday',
        focus: 'Frontend core: modern Angular, React and live coding',
        blocks: [
          {
            id: 'sun-angular-1', start: '09:00', end: '10:15', title: 'Angular, part 1: components and signals', kind: 'study',
            points: [
              'Standalone components and inject() for dependency injection.',
              'Signals: signal(), computed(), effect(), and signal inputs, outputs and model().',
              'The new control flow: @if, @for with track, @switch, and @defer for lazy parts of a page.',
            ],
            links: [
              { label: 'Components', url: 'https://angular.dev/guide/components' },
              { label: 'Signals', url: 'https://angular.dev/guide/signals' },
              { label: 'Control flow', url: 'https://angular.dev/guide/templates/control-flow' },
            ],
          },
          { id: 'sun-break-1', start: '10:15', end: '10:30', title: 'Break', kind: 'break' },
          {
            id: 'sun-angular-2', start: '10:30', end: '11:45', title: 'Angular, part 2: change detection, RxJS, HTTP and SSR', kind: 'study',
            points: [
              'OnPush and zoneless change detection: what triggers a render.',
              'RxJS you will be asked about: switchMap, debounceTime, distinctUntilChanged, takeUntilDestroyed, toSignal.',
              'HttpClient interceptors (auth headers, errors), reactive forms, lazy-loaded routes.',
              'SSR and hydration: tie it to the Angular SSR front end you built at Quantiphi.',
            ],
            links: [
              { label: 'Zoneless', url: 'https://angular.dev/guide/zoneless' },
              { label: 'Interceptors', url: 'https://angular.dev/guide/http/interceptors' },
              { label: 'Reactive forms', url: 'https://angular.dev/guide/forms/reactive-forms' },
              { label: 'Hydration', url: 'https://angular.dev/guide/hydration' },
              { label: 'RxJS operators', url: 'https://rxjs.dev/guide/operators' },
            ],
          },
          {
            id: 'sun-react-1', start: '11:45', end: '12:45', title: 'React hooks and state', kind: 'study',
            points: ['Effects and their pitfalls, custom hooks, where state should live.', 'Server state vs client state (TanStack Query), context and when not to use it.'],
            links: [lib('Hooks', 'react-hooks'), lib('State and client caching', 'react-state')],
          },
          { id: 'sun-lunch', start: '12:45', end: '13:30', title: 'Lunch', kind: 'break' },
          {
            id: 'sun-react-2', start: '13:30', end: '14:30', title: 'React performance and React 19', kind: 'study',
            points: ['memo, useMemo and useCallback: when they actually help.', 'lazy and Suspense, transitions, useOptimistic and actions, virtualised lists, the Profiler.'],
            links: [lib('Performance', 'react-performance'), lib('React core', 'react-core')],
          },
          { id: 'sun-break-2', start: '14:30', end: '14:45', title: 'Break', kind: 'break' },
          {
            id: 'sun-ts-a11y', start: '14:45', end: '15:45', title: 'TypeScript, accessibility and responsive UI', kind: 'study',
            points: ['Generics, narrowing, utility types.', 'Keyboard access, focus management, labels, aria-live; responsive layouts.'],
            links: [lib('TypeScript', 'typescript'), lib('Accessibility and UI', 'a11y-ui')],
          },
          { id: 'sun-break-3', start: '15:45', end: '16:00', title: 'Break', kind: 'break' },
          {
            id: 'sun-live-react', start: '16:00', end: '17:30', title: 'Live coding: three React problems, 25 minutes each', kind: 'practice',
            points: ['Use the code editor, talk through your approach out loud, and check types before you stop.'],
            links: [lib('Live coding: React', 'code-react-live')],
          },
          { id: 'sun-dinner', start: '17:30', end: '18:30', title: 'Dinner', kind: 'break' },
          {
            id: 'sun-live-ts', start: '18:30', end: '19:30', title: 'Live coding: two TypeScript problems, 25 minutes each', kind: 'practice',
            points: ['Pick ones with async work (debounce, retry, a fetch with loading and error states).'],
            links: [lib('Practical TypeScript', 'code-practical-ts')],
          },
          {
            id: 'sun-stories', start: '19:30', end: '20:30', title: 'Your stories and your questions', kind: 'practice',
            points: [
              'Tell me about yourself, frontend first (React and Angular before the back end).',
              'Headline: the Angular human-review platform for document AI at Quantiphi (review, approve, see every step).',
              'React performance at Medidata, a modernization story, mentoring.',
              'Write five questions to ask about the team, the AI features and the first 90 days.',
            ],
          },
          {
            id: 'sun-ready', start: '20:30', end: '21:00', title: 'Get ready for tomorrow', kind: 'event',
            points: ['Test the camera, microphone and the meeting link; charge the laptop; print or open your one-page notes.'],
          },
        ],
      },
      {
        date: '2026-10-19',
        title: 'Monday',
        focus: 'Interview at 1:00 PM, then Walmart preparation',
        blocks: [
          {
            id: 'mon-voice', start: '07:00', end: '08:00', title: 'Say it out loud: React questions', kind: 'practice',
            links: [voice('Voice interview: React', 'react')],
          },
          {
            id: 'mon-notes', start: '08:00', end: '08:30', title: 'Review your one-page notes', kind: 'study',
            points: ['Streaming UI, the agent approval flow, RAG, AI security, Angular signals and RxJS.'],
          },
          {
            id: 'mon-warmup', start: '12:00', end: '12:40', title: 'Warm up', kind: 'practice',
            points: ['Say your introduction and the headline story out loud twice.', 'Recheck the camera, microphone and link.'],
          },
          { id: 'mon-join', start: '12:50', end: '13:00', title: 'Join early', kind: 'event' },
          { id: 'mon-interview', start: '13:00', end: '14:00', title: 'Interview: Sr Frontend (React, Angular, GenAI)', kind: 'test' },
          {
            id: 'mon-node', start: '19:00', end: '20:30', title: 'Walmart prep: a Node.js API with tests', kind: 'practice',
            points: [
              'Build a small Express API: create, read, update, delete.',
              'Input checks that return 400, 404 for missing items, 201 and 204, one error middleware, async errors handled.',
              'Filtering, sorting and paging from query parameters; tests with supertest.',
            ],
            links: [lib('Node.js APIs', 'node-apis'), lib('Node.js core', 'node-core')],
          },
          {
            id: 'mon-dsa', start: '20:30', end: '21:30', title: 'Walmart prep: two timed coding problems', kind: 'practice',
            points: ['One hash-map problem and one two-pointer or sliding-window problem, 25 minutes each.'],
            links: [lib('Hashing', 'code-hashing'), lib('Two pointers and sliding window', 'code-two-pointers-window')],
          },
        ],
      },
      {
        date: '2026-10-20',
        title: 'Tuesday',
        focus: 'Walmart assessment',
        blocks: [
          {
            id: 'tue-dsa', start: '06:30', end: '07:30', title: 'Coding warm-up', kind: 'practice',
            points: ['One stack or queue problem and one BFS/DFS problem, timed.'],
            links: [lib('Stacks and queues', 'code-stacks-queues'), lib('Graphs', 'code-algo-graphs'), lib('Arrays and strings', 'code-arrays-strings')],
          },
          {
            id: 'tue-dryrun', start: '18:30', end: '19:30', title: 'Back-end dry run', kind: 'practice',
            points: ['Add one endpoint to an Express app with its tests written first; give yourself 40 minutes.', 'Read the starter project’s tests before writing code.'],
            links: [lib('Node.js APIs', 'node-apis')],
          },
          {
            id: 'tue-setup', start: '19:30', end: '19:50', title: 'Set up for a proctored test', kind: 'event',
            points: ['Chrome, a quiet room, ID ready, other apps closed, phone away.'],
          },
          {
            id: 'tue-test', start: '20:00', end: '21:05', title: 'Take the Walmart assessment', kind: 'test',
            points: ['Section 1: a language-agnostic coding problem.', 'Section 2: back end in Node.js; use the AI helper for boilerplate and check what it writes.'],
          },
        ],
      },
    ],
  },
];

export const findPlan = (id?: string) => (id ? PLANS.find((p) => p.id === id) : undefined) ?? PLANS[0];

/** The moment a block starts or ends. */
export const at = (plan: Plan, date: string, time: string) => new Date(`${date}T${time}:00${plan.utcOffset}`);
