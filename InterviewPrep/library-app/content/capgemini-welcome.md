---
title: "Capgemini: study plan"
goal: Know what the interview will test, where your resume is strong and where it is thin, and spend your hours where they earn the most.
minutes: 10
---

This track is built from the Capgemini job description for **Sr. Full Stack Engineer** and the resume you sent with the application. The team is building an **enterprise agentic AI platform on Google Cloud**. You would build the application layer around the agents. On the front end, that means React and TypeScript chat interfaces that **stream LLM responses**, plus live dashboards for pipeline runs, logs and telemetry. On the back end, it means Python or Node.js services with **state machines and task queues** that coordinate agent runs and calls to enterprise APIs. Its chapters come from the shared library; the [track page](#/track/capgemini) lists them by priority.

It is a product-style full-stack role, not ML engineering. Nobody will ask you to train a model. They will ask how you stream tokens to a browser, keep a socket alive, design a Postgres schema for agent runs, make a worker idempotent, and test all of it.

The coding share of the interview is not known yet. Prepare for **live coding** (TypeScript and React most likely, Python possible) and for a **deep technical discussion** with a system-design flavour.

## What the interview will test

| Area | Why it is asked | Your position |
|---|---|---|
| **Real-time streaming** (SSE, WebSockets, gRPC streaming) | Required, and central to the chat UI and dashboards | **The main gap.** Not on your resume. Study the streaming chapters first, run the demo, and own the honest answer |
| **React + TypeScript** (state, client caching, component libraries) | Required: 8+ years | Strong: myMedidata, Labels Web Admin UI, the LINE platform; Redux, Zustand, TanStack Query |
| **Python or Node.js services** (microservices, async workers, clean API contracts) | Required: 6+ years | Strong: FastAPI + Pydantic at Quantiphi, Node.js and Passport.js, Azure microservices at Cognizant |
| **State machines and task queues** for agent workflows | Core responsibility | Good: agentic workflows with HITL checkpoints, Labcorp orchestration and background jobs |
| **PostgreSQL plus Firestore or Redis** | Required | Postgres and Firestore are strong; **Redis is a gap** |
| **Testing** (Jest, Vitest, Playwright, Cypress) | Required | Jest, RTL, Cypress are strong; **Playwright and Vitest are gaps** that transfer quickly |
| **SAML / OAuth / OIDC and RBAC** | Responsibility | Strong: SAML with Passport.js, JWT/OAuth2, a role-based Admin UI |
| **Cloud Run, GKE, Pub/Sub, Secret Manager** | Responsibility and nice to have | Cloud Run is strong (three environments); GKE transfers from AKS; Pub/Sub and Secret Manager are new |
| **Agent frameworks** (LangChain, LangGraph) | Nice to have | You built a custom agent engine; LangGraph itself is new |
| **SAP / ERP, Terraform from webhooks** | Nice to have | New, but your FedEx, carrier, Labcorp and Availity integrations are solid ground |

## Your strongest card

The Document AI platform you built at Quantiphi has **almost the same shape as this platform**. It is on GCP and Cloud Run, with a Python/FastAPI backend, a TypeScript front end, SAML login, agentic workflows with tool-use boundaries and human-in-the-loop checkpoints, Pydantic data contracts, and calls to external APIs. Lead with it in your introduction and come back to it whenever a question touches agents, validation, GCP or approvals.

## How each chapter works

- **Notes** at the top are open: read them quickly.
- **Interview questions** hide the answer. Say your answer **out loud** first, as if the interviewer just asked, then press **Show answer**. The first paragraph of every answer is the version to say in 20–40 seconds; the rest is depth for follow-ups.
- **Must know** marks the questions most likely to come up. Tick **Must know only** at the top of a question list to see just those.
- **Coding problems** show the statement. Solve it in a plain editor or on paper first, take hints one at a time, then compare with the solution. Every TypeScript and Python solution in the library has been run with tests; React solutions are type-checked.
- **Rate yourself** on every card: Nailed it, Shaky or Missed. The [Weak spots](#/progress) page collects everything shaky or missed, so your last hour goes where it matters.

## If the interview is tomorrow

Work in this order and use **Must know only** everywhere.

| Block | Time | What to do |
|---|---|---|
| 1. Streaming, part 1 | 75 min | Must-know in [Server-Sent Events](#/sse) and [WebSockets](#/websockets). Say each answer out loud |
| 2. Streaming, part 2 | 45 min | [The streaming chat UI](#/streaming-chat-ui), then the architecture and design questions in [the streaming demo](#/streaming-project). Run the demo if you can |
| 3. Coding warm-up | 60 min | Read [How to pass the live coding round](#/capgemini-coding-round), then solve 4 problems out loud: 2 from [Async JavaScript](#/code-async), 1 from [Live React tasks](#/code-react-live), 1 from [Algorithms, part 1](#/code-algo-arrays) |
| 4. React and TypeScript | 45 min | Must-know in [State and client caching](#/react-state), [Hooks](#/react-hooks) and [TypeScript](#/typescript) |
| 5. Backend | 45 min | Must-know in [Task queues](#/task-queues), [State machines](#/state-machines) and [API design](#/api-design) |
| 6. Data | 30 min | Must-know in [PostgreSQL](#/postgres) and [Redis](#/redis) |
| 7. Your stories | 30 min | Rehearse [your story and project answers](#/capgemini-stories) out loud, twice |
| **Sleep** | 7 h | A rested brain codes faster than a crammed one |
| Morning | 45 min | One [mock interview](#/mock) in the balanced format, then your [weak spots](#/progress) |

> **Short on time?** Do blocks 1, 3 and 7, plus the must-know questions in the streaming chat UI and task queues. That is about three and a half hours.

## If you have two or three days

- **Day 1: close the gap.** All of [Real-time streaming](#/sse) (six chapters), including building and running [the streaming demo](#/streaming-project). Then [Redis](#/redis) and [Playwright](#/playwright).
- **Day 2: the core stack.** React and TypeScript, Backend services, [PostgreSQL](#/postgres) and [Firestore](#/firestore), [Testing](#/testing). Two coding chapters a day, out loud.
- **Day 3: breadth and rehearsal.** [Identity](#/auth-identity), GCP and delivery, [Agent frameworks](#/agents), [Enterprise integration](#/enterprise-integration), then [System design](#/system-design) and the [worked designs](#/design-cases). Finish with two mock interviews in different formats.

## The day of the interview

- **Set up 15 minutes early:** camera, microphone, a quiet room, water, and a plain editor with Node and Python ready in case they let you run code.
- **Expect a shared editor** such as CoderPad, HackerRank or a Google Doc. It may have no autocomplete and may not run code, so practise writing code without running it.
- **Talk the whole time** in the coding part. A clear plan with a small bug beats a silent perfect answer.
- **Lead with the Document AI platform** in your introduction: GCP, agents, HITL, FastAPI and a TypeScript front end. It is the closest match to this role.
- **Own the streaming gap honestly.** Say what you have built to close it, and only what you have actually built and run. The [stories chapter](#/capgemini-stories) has the wording.
- **Have your questions ready** (the [stories chapter](#/capgemini-stories) has a list).
- **Rate:** quote only the rate you already agreed in writing with the vendor. Do not reopen it in a technical round.
