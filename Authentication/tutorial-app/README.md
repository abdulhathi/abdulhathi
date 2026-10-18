# Auth Lab

Every common way to authenticate users and systems, each explained and implemented three times, in **Node.js**
(Express 5, TypeScript run directly by Node), **Python** (FastAPI) and **.NET** (ASP.NET Core minimal APIs), as a React
app. The three implementations behave identically, so you can learn a method in your stack and compare the others.

## Run it

```bash
npm install
npm run dev -- --port 5190   # or start "Auth Lab" from Study Hub
npm test                     # the app's tests (Vitest + Testing Library)
npm run build                # type-check and build static files into dist/
```

## What it covers

| Part | Chapters |
|---|---|
| Start here | How the lab works · every authentication method at a glance · setting up the three stacks |
| Passwords and sessions | Password hashing and lockout · cookie sessions and CSRF · HTTP Basic |
| Keys and tokens | API keys · JSON Web Tokens · refresh tokens and sign-out · HMAC-signed requests and webhooks |
| Single sign-on | OAuth 2.0 (code + PKCE, client credentials) · OpenID Connect · SAML 2.0 |
| Stronger and passwordless | TOTP and recovery codes · passkeys (WebAuthn) · magic links and email codes · mutual TLS |
| After sign-in | Authorization: roles, scopes, policies and object ownership |
| Reference | Security checklist and common attacks · interview questions · cheat sheet |

You rebuild each method yourself in `Authentication/projects/<topic>/`, following the chapter.

## How it is put together

| Path | What it holds |
|---|---|
| `src/chapters/` | One file per chapter, and the registry in `index.ts` (order, titles, goals, URLs, snippet topics) |
| `src/components/Stacks.tsx` | Node.js / Python / .NET tabs; the choice applies to every example and is remembered |
| `snippets/<topic>/{node,python,dotnet}/` | The tested projects shown in the chapters, each with its own tests |
| `scripts/verify.mjs` | Runs every snippet project's tests (`node --test` + tsc, pytest, `dotnet test`) |
| `server/words.ts`, `src/components/WordHelper.tsx` | Select a word or sentence: translate it to Tamil, hear it, have Claude explain it, or ask Claude your own questions about it |
| `CONTENT-GUIDE.md` | How chapters and snippet projects are written and verified |

The app imports snippet files as raw strings, so the code on screen is the code that passed its tests. Shared installs:
`snippets/node_modules` (npm workspaces), `snippets/.venv` (`requirements.txt`), and central NuGet versions in
`snippets/Directory.Packages.props`.

```bash
cd snippets && npm install && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
node scripts/verify.mjs              # every topic, every stack
node scripts/verify.mjs 08-jwt       # one topic
```

The word helper's **Explain** and **Ask** buttons call Claude from the dev server; sign in once with `ant auth login` (or set
`ANTHROPIC_API_KEY`). Translation uses the free MyMemory service.
