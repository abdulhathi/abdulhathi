# RabbitMQ ShopFlow Lab

A 15-chapter, hands-on RabbitMQ tutorial as a React app. You build **ShopFlow**, a small TypeScript order pipeline, and meet one RabbitMQ concept per chapter: queues, acks, exchanges, routing, publisher confirms, quorum queues, dead letters, RPC and automatic reconnection.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (or the next free port)
npm test           # Vitest + Testing Library
npm run build      # type-check and build static files into dist/
npm run preview    # serve the built dist/ locally
```

## How it is put together

| Path | What it holds |
|---|---|
| `src/chapters/` | Chapter content (`Foundations`, `CorePatterns`, `Production`, `Finish`) and the registry in `index.ts` that sets order, titles and URLs |
| `src/components/` | Code blocks with copy buttons, terminal commands, expected output, callout boxes, sidebar and pager |
| `src/diagrams/` | Message-flow diagrams: pure layout maths in `geometry.ts`, React SVG renderer in `Diagram.tsx`, one spec per diagram in `specs.ts` |
| `src/lib/` | Hash routing (`#/hello`), chapter progress and theme, both saved in localStorage |
| `snippets/` | The practice project's source files, shown verbatim in the chapters |

Every file in `snippets/` was run against RabbitMQ 4.2.0 with amqplib 2.2.0 before it went into the tutorial. The app imports them as raw strings (`import.meta.glob(..., { query: '?raw' })`), so the code on screen is the code that ran. `snippets/` sits outside `src/`, so this app's type check does not need amqplib installed.

## Add or change a chapter

1. Write the body as a component in one of the files in `src/chapters/`.
2. Register it in `CHAPTERS` in `src/chapters/index.ts` with an `id` (its URL), number, group and title.
3. Show a project file with `<CodeFile path="src/..." />` after adding the file to `snippets/`.
4. Run `npm test`: every chapter is rendered, so a missing snippet or a broken diagram fails the suite.

## Deploy

`vite.config.ts` sets `base: './'` and the app uses hash URLs, so `dist/` works from any static host or a GitHub Pages subpath without server rewrites.
