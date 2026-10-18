// Every app the hub knows about. The hub's server reads this to start, stop and index the apps,
// and the browser reads it to draw the dashboard. Paths are relative to the github-portfolio folder.

export type Group = 'Interview prep' | 'Learning labs' | 'Demos and APIs' | 'Archive';
export const GROUPS: Group[] = ['Interview prep', 'Learning labs', 'Demos and APIs', 'Archive'];

export type StaticPage = { id: string; title: string; path: string; group?: string };

/** Where the hub finds an app's page list. */
export type PageSource =
  | { type: 'interview-lab' } // src/chapters.ts GROUPS + content/<id>.md titles
  | { type: 'library' } // src/chapters.ts STACKS + src/tracks.ts TRACKS + content/<id>.md titles
  | { type: 'dsa-lab' } // src/chapters/index.ts GROUPS tuples
  | { type: 'object-list'; file: string; hash: '#/' | '#' } // { id: '…', title: '…' } objects in one file
  | { type: 'static'; pages: StaticPage[] };

export type HubApp = {
  id: string;
  name: string;
  group: Group;
  description: string;
  port: number;
  dir: string;
  /** The command that starts the app, run inside `dir`. Never built from user input. */
  command: string[];
  /** A path (relative to `dir`) that must exist before the app can start, and how to create it. */
  needs?: { path: string; fix: string };
  /** Apps that must be running first (the demo client needs its API). */
  requires?: string[];
  /** Superseded apps: listed and startable, but skipped by Start all. */
  archived?: boolean;
  pages: PageSource;
};

const vite = (port: number) => ['node_modules/.bin/vite', '--port', String(port), '--strictPort'];
const npmInstall = (dir: string) => ({ path: 'node_modules', fix: `cd ${dir} && npm install` });

export const APPS: HubApp[] = [
  {
    id: 'library',
    name: 'Interview Library',
    group: 'Interview prep',
    description: 'Every interview topic by tech stack, written once, with one track per job description (Capgemini, CitiusTech) and mock interviews per track.',
    port: 5189,
    dir: 'InterviewPrep/library-app',
    command: vite(5189),
    needs: npmInstall('InterviewPrep/library-app'),
    pages: { type: 'library' },
  },
  {
    id: 'capgemini',
    name: 'Capgemini Interview Lab (old)',
    group: 'Archive',
    archived: true,
    description: 'The original per-JD lab, now part of the Interview Library as the Capgemini track.',
    port: 5184,
    dir: 'InterviewPrep/capgemini-app',
    command: vite(5184),
    needs: npmInstall('InterviewPrep/capgemini-app'),
    pages: { type: 'interview-lab' },
  },
  {
    id: 'citiustech',
    name: 'CitiusTech Interview Lab (old)',
    group: 'Archive',
    archived: true,
    description: 'The original per-JD lab, now part of the Interview Library as the CitiusTech track.',
    port: 5183,
    dir: 'InterviewPrep/tutorial-app',
    command: vite(5183),
    needs: npmInstall('InterviewPrep/tutorial-app'),
    pages: { type: 'interview-lab' },
  },
  {
    id: 'lead-date-picker',
    name: 'React + .NET lead: React date picker',
    group: 'Interview prep',
    description: 'Model answer to the React question from the React + .NET lead interview: pass a value through props and raise an event from a date picker.',
    port: 5186,
    dir: 'InterviewPrep/react-dotnet-lead/react-date-picker',
    command: vite(5186),
    needs: npmInstall('InterviewPrep/react-dotnet-lead/react-date-picker'),
    pages: { type: 'static', pages: [{ id: 'home', title: 'Date picker demo', path: '/' }] },
  },
  {
    id: 'lead-api',
    name: 'React + .NET lead: AgentInformation API',
    group: 'Interview prep',
    description: 'Model answer to the .NET question from the React + .NET lead interview: GET api/v1/agents with a clean folder structure.',
    port: 5290,
    dir: 'InterviewPrep/react-dotnet-lead/AgentInformation',
    command: ['dotnet', 'run', '--project', 'src/AgentInformation.Api', '--urls', 'http://localhost:5290'],
    pages: {
      type: 'static',
      pages: [
        { id: 'agents', title: 'GET /api/v1/agents', path: '/api/v1/agents', group: 'Endpoints' },
        { id: 'agent', title: 'GET /api/v1/agents/AG-1001', path: '/api/v1/agents/AG-1001', group: 'Endpoints' },
        { id: 'openapi', title: 'OpenAPI document', path: '/openapi/v1.json', group: 'Reference' },
      ],
    },
  },
  {
    id: 'dsa',
    name: 'DSA Lab',
    group: 'Learning labs',
    description: 'Every LeetCode technique, chapter by chapter, with layered hints, a problem tracker and spaced review.',
    port: 5182,
    dir: 'DSA/tutorial-app',
    command: vite(5182),
    needs: npmInstall('DSA/tutorial-app'),
    pages: { type: 'dsa-lab' },
  },
  {
    id: 'auth',
    name: 'Auth Lab',
    group: 'Learning labs',
    description: 'Every way to authenticate, built and tested in Node.js, Python and .NET: passwords, sessions, API keys, JWT, OAuth 2.0, OIDC, SAML, TOTP, passkeys, magic links and mTLS.',
    port: 5190,
    dir: 'Authentication/tutorial-app',
    command: vite(5190),
    needs: npmInstall('Authentication/tutorial-app'),
    pages: { type: 'object-list', file: 'src/chapters/index.ts', hash: '#/' },
  },
  {
    id: 'nodejs',
    name: 'Node.js Lab',
    group: 'Learning labs',
    description: 'From your first script to a production API: modules, async, the event loop, streams, Express, testing and deployment.',
    port: 5181,
    dir: 'NodeJS/tutorial-app',
    command: vite(5181),
    needs: npmInstall('NodeJS/tutorial-app'),
    pages: { type: 'object-list', file: 'src/chapters/index.ts', hash: '#/' },
  },
  {
    id: 'rabbitmq',
    name: 'RabbitMQ tutorial',
    group: 'Learning labs',
    description: 'Build ShopFlow step by step: queues, exchanges, reliable delivery, dead letters and RPC.',
    port: 5187,
    dir: 'RabbitMQ/tutorial-app',
    command: vite(5187),
    needs: npmInstall('RabbitMQ/tutorial-app'),
    pages: { type: 'object-list', file: 'src/chapters/index.ts', hash: '#/' },
  },
  {
    id: 'aks',
    name: 'AKS prep',
    group: 'Learning labs',
    description: 'Deploy a .NET worker to Azure Kubernetes Service: Docker, ACR, manifests, kubectl and Azure DevOps CI/CD.',
    port: 5188,
    dir: 'AKS/aks-prep',
    command: vite(5188),
    needs: npmInstall('AKS/aks-prep'),
    pages: { type: 'object-list', file: 'src/topics.ts', hash: '#' },
  },
  {
    id: 'streaming-client',
    name: 'Streaming demo',
    group: 'Demos and APIs',
    description: 'React client for the streaming agent chat: tokens over SSE with resume, approve and cancel over a WebSocket.',
    port: 5185,
    dir: 'InterviewPrep/capgemini-app/projects/streaming-demo/client',
    command: vite(5185),
    needs: npmInstall('InterviewPrep/capgemini-app/projects/streaming-demo/client'),
    requires: ['streaming-api'],
    pages: { type: 'static', pages: [{ id: 'home', title: 'Streaming agent chat', path: '/' }] },
  },
  {
    id: 'streaming-api',
    name: 'Streaming demo API',
    group: 'Demos and APIs',
    description: 'FastAPI backend for the streaming demo: a fake agent, an SSE event log with Last-Event-ID resume, and a control socket.',
    port: 8010,
    dir: 'InterviewPrep/capgemini-app/projects/streaming-demo/backend',
    command: ['../../../.venv/bin/python', '-m', 'uvicorn', 'app.main:app', '--port', '8010'],
    needs: {
      path: '../../../.venv/bin/python',
      fix: 'cd InterviewPrep/capgemini-app && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt',
    },
    pages: {
      type: 'static',
      pages: [
        { id: 'docs', title: 'Swagger UI', path: '/docs', group: 'Reference' },
        { id: 'redoc', title: 'ReDoc', path: '/redoc', group: 'Reference' },
        { id: 'openapi', title: 'OpenAPI document', path: '/openapi.json', group: 'Reference' },
      ],
    },
  },
];

export const findApp = (id: string) => APPS.find((a) => a.id === id);
export const baseUrl = (app: HubApp) => `http://localhost:${app.port}`;
