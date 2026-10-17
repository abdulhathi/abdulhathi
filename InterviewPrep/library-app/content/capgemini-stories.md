---
title: "Capgemini: your story, project answers and questions to ask"
goal: Tell your story in 90 seconds, walk through your best projects in STAR form, and handle the gap questions (streaming, Redis, Playwright) honestly and confidently.
minutes: 35
---

These answers are built only from the resume you sent with this application. Read each one aloud twice, then say it in your own words. Do not memorise it word for word: it should sound like you talking. Where an answer needs a personal example the resume does not cover (a disagreement, a mistake), the card gives you the structure, and you fill it with a real story of your own. Never invent one.

## The one thing to get across

You are a **senior full-stack engineer with nearly twenty years of experience** who most recently **built an agentic AI platform on Google Cloud**. It had a Python/FastAPI backend, a TypeScript front end, SAML login, Pydantic data contracts, human-in-the-loop checkpoints and Cloud Run deployments, which is almost the shape of this platform. Add React and TypeScript product work (myMedidata, Labels Web, LINE) and years of enterprise integrations, and you are someone who can own a feature from the browser to the database. Come back to this whenever an answer drifts.

## STAR, in one breath

- **Situation:** the context in one sentence (client, system, problem).
- **Task:** what you were responsible for.
- **Action:** what *you* did. Use "I", name the technology, explain one decision and its trade-off.
- **Result:** what changed. Use a number only if it is on your resume (99.99% uptime, about 24 OrderingStore apps plus 10 more, Dev/SIT/UAT releases); otherwise describe the outcome plainly.

## Interview questions

### Tell me about yourself. {core}

"I'm a senior full-stack engineer with nearly twenty years of experience across React and TypeScript front ends, Python, Node.js and .NET services, and cloud platforms on GCP, Azure and AWS. Most recently, at Quantiphi, I was lead consultant on a Document AI platform on Google Cloud. It had a Python and FastAPI backend and an Angular SSR front end. Documents come in, AI extracts the fields, Pydantic schemas validate them as a quality gate, and human reviewers check and approve before the data goes to external APIs. I built agentic workflows with tool-use boundaries, validation loops and human-in-the-loop checkpoints, added SAML login with Passport.js, and deployed everything with Docker to Cloud Run across Dev, SIT and UAT. Before that, at Medidata, I worked on myMedidata, a patient-facing React, Redux and TypeScript app, where we cut initial load time with lazy loading. Before that I spent thirteen years at Cognizant as a technical lead, including moving monolithic applications to microservices on Azure. Today, at The Dot Corp, I work on React applications, enterprise integrations such as a FedEx SOAP-to-REST modernisation, and AKS deployments. This role brings it together: real-time React interfaces and backend orchestration for agents on GCP, which is exactly where my recent work has been."

**Tips:** keep it to about 90 seconds. Give the Document AI platform the most time: it is the closest match. End on why this role, so the next question lands on your strengths.

### Walk me through the Document AI platform you built. {core}

**Situation:** a state Medicaid programme needed to process large volumes of eligibility documents (MAGI and non-MAGI forms, paystubs) that staff were handling by hand.
**Task:** as lead consultant, I engineered the full-stack human-in-the-loop platform: the Python/FastAPI backend, the Angular SSR review front end, authentication, and the deployment pipeline.
**Action:** describe the flow:

1. Documents land in Cloud Storage and ingestion picks them up.
2. AI extraction pulls out the fields.
3. **Pydantic schemas** enforce a data contract on every extraction. This is the quality gate *before* human review: wrong types and missing required values are caught by the schema, not left for a reviewer to spot by eye.
4. Reviewers see the document through **GCS signed URLs** (no public bucket access), sign in with **SAML** through Passport.js on Node.js, and correct and approve.
5. Approved data is submitted to **external APIs**.
6. Services run in **Docker** containers, pushed to **Artifact Registry** and deployed to **Cloud Run** through Dev, SIT and UAT.

I also built **agentic AI workflows** with tool-use boundaries, validation loops and HITL checkpoints, so the AI never acts outside what it is allowed to do, and a human approves before anything leaves the system.
**Result:** a production-ready pipeline where AI does the bulk extraction, the schema gate checks every extraction, humans review with the document beside the data, and the data contract keeps bad data out of downstream systems.

**Map it to this role out loud:** "The agent runs, the approval checkpoints, the external API calls and the Cloud Run deployments are the same building blocks your platform needs. The piece I'd add is streaming the agent's progress to the browser in real time."

**Likely follow-ups:** how a run moves between states (see [State machines](#/state-machines)), what happens when an external API fails (retries with backoff, idempotency keys, a dead-letter path: see [Task queues](#/task-queues)), how SAML works (see [Identity](#/auth-identity)).

### Have you built real-time streaming with WebSockets or SSE? {core}

This is the question most likely to decide the round, because streaming is a required qualification and it is not on your resume. Answer honestly, then show depth. Do not bluff: a follow-up question will expose it.

"Not as a production feature on my resume. My production work has been REST APIs, event-driven pipelines and async workflows. Because streaming is central to this role, I went deep on it. I can walk you through how I'd stream LLM tokens to a React client: SSE over a fetch stream for the tokens, because it's one-way, works over plain HTTP and resumes with Last-Event-ID; and a WebSocket where the user needs to send control messages mid-run, like approve or cancel. On the client, I'd batch token updates so React isn't re-rendering per token, use an AbortController for the stop button, and announce the finished message with an aria-live region. On the server, I'd use an async generator in FastAPI, detect client disconnects to cancel the agent run, send keep-alive comments, and on Cloud Run, watch the request timeout and turn on session affinity for sockets."

**Only if it is true:** if you have built and run [the streaming demo](#/streaming-project), add: "I built a small end-to-end demo of exactly this, a FastAPI backend and a React client, to make sure I understand the failure cases: reconnects, resume and cancellation." If you have not run it, do not say it.

Depth for follow-ups: [Server-Sent Events](#/sse), [WebSockets](#/websockets), [gRPC](#/grpc), [the streaming chat UI](#/streaming-chat-ui).

### Tell me about your React and TypeScript experience. {core}

"About seven years of React across several products, plus Angular and Angular SSR. At Medidata I worked on myMedidata, the patient-facing clinical-trial platform, with React, Redux, Hooks and TypeScript. I worked with the team on performance, using lazy loading and code splitting so patients didn't download the whole app up front, and cleaner state management. That reduced initial load times. At The Dot Corp I added role-based admin features to a React Labels Web application, used to manage carrier accounts and credentials for FedEx, USPS, UPS and Endicia, and shipped them to production. I've also worked on the React-based LINE platform, which consolidates many customer-specific storefronts into one multi-tenant architecture. Day to day I use React with TypeScript, TanStack Query for server state and caching, and Redux or Zustand when the client state needs it."

If they press on "8+ years": "Closer to seven on React itself, plus years of front-end work in Angular and earlier JavaScript applications. What matters for this role is depth in state, caching and performance, and I'm happy to go deep on any of those." Then be ready for [State and client caching](#/react-state).

### How do you design an agent workflow so it is safe and recoverable? {core}

"I treat an agent run as a state machine, not a loop. Each run has explicit states: planning, calling a tool, waiting for approval, completed, failed. Every transition is persisted, so a crashed worker can resume from the last checkpoint instead of starting over. Tools have boundaries: an allow-list, validated arguments, timeouts and a step budget. Anything that changes an external system goes through a human-in-the-loop checkpoint first. At Quantiphi I built exactly these pieces: tool-use boundaries, validation loops and HITL checkpoints. Model output was treated as untrusted input and validated with Pydantic before anything acted on it. Here I'd add idempotency keys on every external call, so a retry never creates a duplicate purchase order, and I'd stream each state change to the UI so operators see progress live."

Depth: [State machines](#/state-machines), [Agent frameworks](#/agents), [Enterprise integration](#/enterprise-integration).

### Tell me about your backend and microservices experience. {core}

"On the Python side, the FastAPI services at Quantiphi, with Pydantic models as the API contract and validation gate, and Python backend APIs at Medidata alongside Ruby on Rails. On Node.js, I implemented SAML authentication with Passport.js for the Document AI platform. My deepest microservices work was at Cognizant, in .NET on Azure: I spearheaded moving monolithic applications to cloud-based microservices, which significantly reduced infrastructure costs. There I also delivered mission-critical REST APIs in C# and .NET Core that achieved 99.99% uptime. The principles carry straight over to Python or Node: services split by business capability, stable contracts for consumers, timeouts and retries between services, and observability with correlation IDs."

Be honest that the largest microservices programme was in .NET if they ask about language. Depth: [Microservices](#/microservices), [FastAPI](#/fastapi), [Node.js APIs](#/node-apis).

### Tell me about an integration with an external or enterprise system. {core}

Pick by the interviewer's interest:

- **FedEx SOAP to REST (The Dot Corp):** about 24 legacy OrderingStore applications plus 10 more depended on FedEx's SOAP APIs. I inventoried the applications, analysed dependencies, implemented the REST integration and validated each application. Talk about the risk: shipping and labelling cannot break, so you inventory and validate application by application instead of doing a big-bang switch.
- **External submission APIs (Quantiphi):** approved document data was submitted to external APIs only after human review. Talk about validating before sending, and handling failures without duplicate submissions.
- **Labcorp workflows (The Dot Corp):** API-based order processing, Azure Blob Storage, orchestration workflows and background jobs. Talk about how background work is coordinated and retried.
- **Availity (Cognizant):** integrating Availity's multi-payer appeals portal with Molina, so providers could submit and track claim appeals.

Bridge to SAP if asked: "I haven't integrated with SAP itself, but the patterns are the same: an anti-corruption layer that maps their model to ours, OAuth client credentials, idempotency, rate limits and retries. I've read up on how SAP exposes OData services." See [Enterprise integration](#/enterprise-integration).

### How do you approach testing? {core}

"I test at three levels. Unit tests for logic, React Testing Library tests for components, which query by role the way a user sees the page, and end-to-end tests for the critical journeys. At Medidata I wrote Cypress tests with Cucumber, and I've used Jest and React Testing Library throughout. For this role I'd use Playwright for E2E. It's not on my resume, but it's the same idea as Cypress with a different architecture: it drives the browser out of process, supports multiple tabs and contexts, and its auto-waiting and web-first assertions remove most of the flakiness. For streaming UIs, I'd mock the stream at the network layer, with MSW in component tests and `page.route` in Playwright, so tests are deterministic."

Depth: [Testing](#/testing), [Playwright](#/playwright).

### Have you used Redis, gRPC or Playwright? {core}

Answer each honestly in one sentence, then show you know where it fits:

- **Redis:** "Not in production. I know where it fits here: caching hot reads, rate limiting calls to LLM and enterprise APIs, pub/sub or Streams to fan out events to many WebSocket servers, and short-lived session data. I'd watch out for cache stampedes and treat it as a cache, not the source of truth." See [Redis](#/redis).
- **gRPC:** "Not in production. I know the model: protobuf contracts, the four kinds of RPC including bidirectional streaming over HTTP/2, deadlines that propagate, and that browsers need gRPC-Web or Connect." See [gRPC](#/grpc).
- **Playwright:** see the testing answer above.

The pattern: honest, specific, then the bridge. Never "I'm sure I'd pick it up quickly" on its own.

### How have you handled authentication and role-based access? {core}

"At Quantiphi I implemented SAML authentication with Passport.js on Node.js for the review platform, and documents were only reachable through short-lived GCS signed URLs. At Medidata our APIs used JWT and OAuth2. At The Dot Corp I built role-based admin features in the Labels Web app, where only certain roles can manage carrier accounts and credentials. For an enterprise platform like this, I'd map identity-provider groups to application roles at login, enforce permissions on the server, never only in the UI, and authenticate WebSocket and SSE connections too, which people often forget."

Depth: [Identity and access](#/auth-identity), [Web and LLM security](#/web-security).

### Describe a production incident you were involved in.

The resume fact: at The Dot Corp you assisted with production support and investigation of OrderingStore service disruptions during an **Azure regional outage**. Structure: what users saw, how you investigated (logs, health checks, which dependencies were regional), what you did to restore service or work around the outage, and what you would change (for example, multi-region failover for critical paths, better alerting, and runbooks). Use only details you actually remember, and keep the focus on calm, systematic diagnosis and on what was learned.

### Tell me about a large migration or modernisation.

- **FedEx SOAP to REST (The Dot Corp):** see the integration answer.
- **Monolith to microservices on Azure (Cognizant):** you spearheaded the migration, and it significantly reduced infrastructure costs. Talk about splitting services along business capabilities and keeping APIs stable for consumers. Mention the strangler-fig approach if they ask how you migrated without a big-bang cutover, but only claim the parts you actually did. (The 99.99% uptime on your resume is for the REST APIs you delivered, a separate achievement: do not tie it to the migration.)

### How do you use AI tools in your own engineering work?

"Every day, with discipline. I use Claude Code for codebase analysis, understanding legacy code, implementation, refactoring and code review. On the Document AI platform it sped up FastAPI scaffolding, Angular SSR components and Cloud Functions boilerplate. The rule I hold myself to is that I review and validate every change myself, just as I would a colleague's pull request. AI makes me faster, but I own the correctness."

This matters more than usual here: you would be building an AI platform, so show that you use AI tools well *and* critically.

### Why Capgemini, and why this role? {core}

"Two reasons. First, the work itself: building the real-time application layer for an agentic AI platform on Google Cloud is exactly the direction my recent work has gone. I built agent workflows with human-in-the-loop checkpoints on GCP, and this role adds the parts I find most interesting, streaming the agent's work to users and orchestrating it reliably. Second, the scale: an enterprise platform where agents act on real operational systems needs the security, testing and integration discipline I've spent my career on."

Keep it to the work. Do not quote company facts you are not sure of.

### Tell me about a disagreement with a teammate or stakeholder.

Use a real example of your own. The structure that works:

1. The disagreement, stated neutrally (for example, a design choice or a deadline versus quality).
2. How you understood the other side's goal first.
3. The data or prototype you used to decide, rather than opinions.
4. The outcome, and the relationship afterwards.

End with what you do differently now. Avoid stories where the other person is simply wrong.

### Tell me about a mistake you made.

Use a real example. Pick a technical mistake with a clear lesson, for example a missed edge case or an assumption about an integration. Then cover how you found it, how you fixed it, and the safeguard you added afterwards (a test, a validation, a checklist). Keep the mistake small and the learning concrete.

### How do you mentor or lead other engineers?

At Cognizant you mentored and coached engineers, improving team velocity and accelerating onboarding, and you led large-scale production deployments. Talk about habits you actually used: code reviews that teach rather than just correct, pairing on the tricky parts, onboarding notes, and delegation with clear ownership. In a senior role on this team, add how you would raise the bar on testing and observability for the streaming paths.

### What are your rate and availability?

"The rate I've already agreed in writing with the vendor, on W-2." Then give the same start date you have already shared with the vendor. Do not reopen the rate in a technical round.

## Questions to ask them

Pick three or four. The first two matter most for this role.

- **What does the streaming layer use today: SSE, WebSockets or gRPC streaming? What has been hardest about it?**
- **How are agent runs orchestrated now: a framework like LangGraph, a custom engine, or a workflow service?** Where do human approvals happen?
- How is the team split between front-end, back-end and AI specialists? Who would I work with day to day?
- Which enterprise systems do the agents act on first, and how are actions approved and audited?
- What does the path to production look like: environments, CI/CD, how often you ship?
- What would success look like in the first 90 days?
- What is the next step in the process, and when can I expect to hear back?
