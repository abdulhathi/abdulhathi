# Writing an Auth Lab chapter

The Auth Lab (`Authentication/tutorial-app`, port 5190) teaches every common way to authenticate, each built and
tested in **Node.js (Express 5, TypeScript run directly by Node 25)**, **Python (FastAPI)** and **.NET (ASP.NET Core
minimal APIs, .NET 9)**. The reader picks a stack once; every code example switches to it.

**The template is chapter 04, Passwords.** Read `src/chapters/passwords.tsx` and every file under
`snippets/04-passwords/` before you start, and copy their structure, tone and test style.

## What you own, and what you must not touch

You edit only:

- your chapter file(s): `src/chapters/<chapter-id>.tsx` (replace the placeholder, keep the exported component name);
- your snippet folders: `snippets/<NN-topic>/{node,python,dotnet}/` (and an optional `snippets/<NN-topic>/README.md`);
- your diagram spec file: `src/diagrams/specs/<chapter-id>.ts` (optional).

Never edit shared files: `src/components/*`, `src/lib/*`, `src/App.tsx`, `src/chapters/index.ts` (titles, goals and
topics are fixed there), `src/index.css`, other chapters, `snippets/package.json`, `snippets/requirements.txt`,
`snippets/Directory.*.props`, `scripts/*`. If you need a change there, finish what you can and say so in your report.

**Never run `npm install`, `pip install`, `dotnet add package` or anything else that changes the shared installs.**
Seven writers work at the same time and concurrent installs corrupt them. Everything below is already installed. If you
truly need another package, stop and say so in your report.

## The three projects for a topic

Each stack folder is a runnable project with its own tests, and all three implement **the same behaviour with the same
HTTP routes, status codes and JSON bodies**, so the chapter can show one curl session for all of them.

### Node.js: `snippets/<topic>/node/`

- `package.json` (name `<topic>-node`, `"type": "module"`, scripts `start`, `test`
  (`node --test "test/**/*.test.ts"`), `typecheck`), listing the dependencies it uses with the versions from
  `snippets/package.json`. It is an npm workspace: packages resolve from `snippets/node_modules`.
- `tsconfig.json`: copy `04-passwords/node/tsconfig.json` exactly.
- `src/app.ts` exports a `createApp(...)` (dependencies such as clocks and keys as parameters), `src/server.ts`
  listens on `PORT` (default 3000). Tests in `test/*.test.ts` with `node:test` + `node:assert/strict`, calling the app
  over real HTTP on `app.listen(0)` with `fetch`.
- Node runs TypeScript by **type stripping**: no enums, namespaces, parameter properties (`constructor(private x)`),
  or decorators; import local files with the `.ts` extension; `import type` for types.
- Installed: express 5, jose, argon2, bcryptjs, cookie-parser, express-session, helmet, cors, @simplewebauthn/server,
  openid-client, otpauth, xml-crypto, @xmldom/xmldom, passport, passport-local, passport-jwt, and their @types;
  plus everything built into Node (`node:crypto`, `node:https`, `node:tls`, Web Crypto, `fetch`).

### Python: `snippets/<topic>/python/`

- Flat modules (`app.py` with `create_app(...)` returning a FastAPI app, plus helpers), tests `test_*.py` using
  `fastapi.testclient.TestClient` (or plain functions), `requirements.txt` listing what this project uses.
- Run with the shared environment: `snippets/.venv/bin/python -m pytest -q`.
- Installed: fastapi, uvicorn, httpx, pytest, pyjwt[crypto], argon2-cffi, bcrypt, itsdangerous, pyotp, webauthn,
  python-multipart, authlib, cryptography, signxml, lxml; plus the standard library (`hmac`, `secrets`, `hashlib`,
  `ssl`, ...).

### .NET: `snippets/<topic>/dotnet/`

- `Api/Api.csproj` (`Microsoft.NET.Sdk.Web`), `Api/Program.cs` (minimal API ending with `public partial class Program;`)
  plus small classes; `Api.Tests/Api.Tests.csproj` (xunit + `Microsoft.AspNetCore.Mvc.Testing`, `ProjectReference` to
  `../Api/Api.csproj`, `<Using Include="Xunit" />`), tests using `WebApplicationFactory<Program>`;
  `<Name>.sln` made with `dotnet new sln -n <Name>` and `dotnet sln add` for both projects.
- **Central package management:** `PackageReference` elements have **no Version**; versions come from
  `snippets/Directory.Packages.props`. Target framework, nullable and implicit usings come from
  `snippets/Directory.Build.props` (do not repeat them).
- Available packages: Microsoft.AspNetCore.Authentication.JwtBearer, .OpenIdConnect, .Certificate (9.0.21),
  Microsoft.Extensions.Identity.Core, System.Security.Cryptography.Xml, Konscious.Security.Cryptography.Argon2,
  BCrypt.Net-Next, Otp.NET, Fido2.AspNet, xunit, xunit.runner.visualstudio, Microsoft.NET.Test.Sdk,
  Microsoft.AspNetCore.Mvc.Testing; plus everything in the shared framework (System.Security.Cryptography,
  System.IdentityModel.Tokens.Jwt comes with JwtBearer, TimeProvider, ...).
- For time, inject `TimeProvider` and use a small `ManualClock : TimeProvider` in tests (see 04-passwords).

### Rules for all three

- **No outside services.** Tests never call the internet. When a method needs an identity provider, an authorization
  server or a mail server, build a tiny local one (in the test, or as a small module in the project) and test against
  it. Showing how to configure a real provider (Microsoft Entra ID, Google, Okta, Keycloak) is welcome as a clearly
  labelled `<Code>` block that says it is configuration, not run by the tests.
- **Keys and certificates are generated at run time** (in tests or at start-up), never committed. Files ending
  `.key.pem` and `.pfx` are ignored by git and never shown.
- **Fast tests:** use cheap hashing costs and fake clocks; no sleeps longer than a few milliseconds.
- **Behave the same in every stack:** same routes, statuses, JSON field names and error messages; tests that mirror
  each other (the same cases, the same names translated to each style).

## Verify everything you show

```bash
cd Authentication/tutorial-app
node scripts/verify.mjs <NN-topic>                   # every stack's tests (+ tsc for Node)
node scripts/verify.mjs <NN-topic> --stack dotnet    # one stack
npx tsc -p .                                         # the lab app type-checks
npx vitest run src/test/chapters.test.tsx -t "<NN> " # your chapter renders (e.g. -t "08 ")
```

All must pass before you finish. **Every "What you should see" box holds output you captured from a real run** (test
summaries, curl sessions). Never invent output. To capture a curl session, start the server on a port in **your
assigned range** (given in your brief), in the background, record its PID, run curl, then stop it with
`kill <PID>`. Never use `pkill` or `killall`, and never use ports outside your range (other writers are running servers
at the same time). After `dotnet run`, check no `Api` process is left running.

## The chapter

Write `src/chapters/<chapter-id>.tsx`. The registry already holds the number, title, goal and topic. Structure:

1. `<ChapterIntro time=… project="<NN-topic>" learn={[…]} tools={[Node.js, Python, .NET rows]} />`
2. Why the method exists and how it works, in plain words, with a `<TableWrap>` comparison where useful and a
   `<Diagram>` of the flow (your spec in `src/diagrams/specs/<chapter-id>.ts`, built with `n()`/`e()` from
   `./helpers`; see `specs/passwords.ts`; the `title` is the diagram's full text description).
3. Numbered `<Step n={…}>` sections, each explaining the code first, then `<StackFiles node=… python=… dotnet=… />`
   showing the tested files (paths are `"<NN-topic>/<stack>/<file>"`).
4. Run the tests: `<StackTerminal>` + `<Output panes=[…]>` with the real summaries.
5. Try it: start the server (`<StackTerminal>`) and a captured curl session in `<Output>`.
6. A "Mistakes to avoid" table, and `<Box kind="warn" | "key" | "tip">` notes where they help.
7. At least two `<Checkpoint>` questions, an `<Exercises>` list (3–4 tasks to build in `projects/<NN-topic>`, each with
   a hint), and a `<Recap>`.

Components: `src/components/Content.tsx` (Box, Checkpoint, ChapterIntro, Step, Exercises, Recap, TableWrap, Output,
Kbd), `src/components/Code.tsx` (Code, CodeFile, Terminal), `src/components/Stacks.tsx` (ByStack, StackFiles,
StackTerminal). `ByStack` takes any content per stack when files are not enough.

## Writing style

- Plain, direct English for a working developer who has not used this method before. Short sentences. Explain *why*
  before *how*. Define every term the first time (for example "an **ID token** is …").
- American spelling (authorization, authenticate), matching the RFCs and the libraries.
- Accurate: name RFCs and specs correctly (RFC 6749 OAuth 2.0, RFC 7636 PKCE, RFC 7519 JWT, RFC 6238 TOTP, RFC 9700
  OAuth security BCP, RFC 8705 mTLS, WebAuthn Level 3, SAML 2.0 Core, OpenID Connect Core 1.0, ...). When unsure how a
  library behaves, read its installed source (`snippets/node_modules`, `snippets/.venv/lib/python3.14/site-packages`,
  `~/.nuget/packages`) instead of guessing.
- Security advice must be current (2026): OWASP cheat sheets, NIST SP 800-63B, RFC 9700.
- Public repository: no real names, emails, phone numbers, secrets or company names; use `example.com` addresses.
- Write `\u…` escapes in code, never raw invisible characters (U+FEFF, U+200B).

## Your report

Short: chapters written; for each topic the test counts per stack (from `verify.mjs`); anything you could not make
work, any shared-file change you need, and any spot where the three stacks had to differ and why.
