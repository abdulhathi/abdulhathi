# Study Hub

One page for every study app in this portfolio: see which are running, start and stop them, open any page in a
built-in viewer, and search pages across all of them.

```bash
cd StudyHub
npm install     # once
npm run dev     # http://localhost:5180
```

## What it does

- **Dashboard** with every app, grouped (interview prep, learning labs, demos and APIs), each with a live status:
  Running, Starting, Stopped, or Running but started outside the hub.
- **Start all**, or **Start** and **Stop** per app. The streaming demo client starts its API automatically.
- **Viewer:** open an app and pick any of its pages from the list on the left; the page loads in a frame on the right.
  **New tab** opens the same page on its own.
- **Search** (press `/`) across every page of every app: interview chapters, DSA topics, Node.js chapters and more.
- **Hide apps** (top-left button, or press `[`) collapses the apps list so a page gets the full width; the choice is
  remembered. Inside an app, **Hide pages** does the same for its page list. On a phone the button opens the apps menu.
- **Output:** each app the hub starts writes its output to `.hub/logs/<app>.log`, shown on its card and in the viewer
  when it is not running (useful when an app fails to start).

## The apps

| App | Port | Folder |
|---|---|---|
| Capgemini Interview Lab | 5184 | `InterviewPrep/capgemini-app` |
| CitiusTech Interview Lab | 5183 | `InterviewPrep/tutorial-app` |
| React + .NET lead: React date picker | 5186 | `InterviewPrep/react-dotnet-lead/react-date-picker` |
| React + .NET lead: AgentInformation API (.NET) | 5290 | `InterviewPrep/react-dotnet-lead/AgentInformation` |
| DSA Lab | 5182 | `DSA/tutorial-app` |
| Node.js Lab | 5181 | `NodeJS/tutorial-app` |
| RabbitMQ tutorial | 5187 | `RabbitMQ/tutorial-app` |
| AKS prep | 5188 | `AKS/aks-prep` |
| Streaming demo (React) | 5185 | `InterviewPrep/capgemini-app/projects/streaming-demo/client` |
| Streaming demo API (FastAPI) | 8010 | `InterviewPrep/capgemini-app/projects/streaming-demo/backend` |

Each app needs its own dependencies installed once (`npm install` in its folder; the streaming API uses the
Capgemini lab's Python `.venv`). The hub tells you the exact command if something is missing.

## How it works

- `src/apps.ts` lists the apps: name, port, folder, the command that starts it, and where its pages come from.
  To add an app, add an entry there.
- **Page lists are read from each app's own source** (`server/pages.ts`), so new chapters appear without editing the
  hub: the interview labs' `src/chapters.ts` and `content/*.md` titles, the DSA lab's chapter registry, and the
  `{ id, title }` objects in the Node.js, RabbitMQ and AKS apps.
- The hub's Vite dev server also serves a small API under `/api` (`server/hub-api.ts`) that checks ports and starts
  and stops apps (`server/processes.ts`).

## Safety

- The hub only ever runs the commands written in `src/apps.ts`; nothing in a request can change a command.
- It stops **only processes it started**. Their PIDs are recorded in `.hub/pids.json`, and before stopping one the hub
  checks that the PID still runs the same command, because PIDs get reused. An app started some other way shows as
  running, and the hub leaves it alone.
- Apps are started detached, so they keep running if the hub page or the hub itself is closed. Use
  **Stop apps started here** when you are done.
- Start and stop requests must come from the hub's own page (a custom header plus an Origin check), so another
  website cannot trigger them.

## Checks

```bash
npm run verify   # type-check and tests (page readers against the real apps, start/stop of a real process, the UI)
```
