---
title: "Gatekeeper: an OAuth 2.0 / OIDC-secured app with a BFF, RBAC and a security test suite"
summary: A small multi-tenant app secured the way enterprises expect: OpenID Connect login with PKCE through a backend-for-frontend, HttpOnly session cookies, a resource API that validates JWTs and enforces role and object-level access, plus security headers, rate limits and automated security scans in CI.
time: 4–5 days of evenings
---

## What you will build

Gatekeeper is a tiny expense-approval app whose real subject is security. Users sign in with OpenID Connect (authorization code flow with PKCE) through a **backend-for-frontend (BFF)**, so the browser never holds an access token: it gets an HttpOnly, Secure, SameSite session cookie. The BFF calls a separate **resource API** with the access token; the API validates the JWT (signature via JWKS, `iss`, `aud`, `exp`) and enforces **role-based** access (employee, manager, admin) and **object-level** access (you can only see your own team's expenses; managers can approve only their team's).

Then you attack it: a test suite that proves broken object level authorisation (BOLA) is blocked, CSRF fails, tokens with the wrong audience or algorithm are rejected, and an OWASP ZAP baseline scan runs in CI. A short threat model in the repository explains the decisions.

## What it proves

- OAuth 2.0 and OpenID Connect in practice: authorization code + PKCE, ID token vs access token, refresh token rotation, logout
- The BFF pattern and why tokens should not live in `localStorage`
- JWT validation done properly: JWKS, `kid`, algorithm allow-list, audience and issuer checks, clock skew
- Authorisation: RBAC plus object-level checks, tested against BOLA
- Web security: CSRF defences, CORS, CSP and security headers, rate limiting, input validation, secrets handling
- Security automation: dependency scanning, CodeQL, OWASP ZAP baseline scan
- Keywords: OAuth 2.0, OpenID Connect, PKCE, JWT, RBAC, OWASP Top 10, OWASP API Security Top 10, threat modelling, secure SDLC

## Architecture

```text
 Browser (React or server-rendered pages)
     │  session cookie: HttpOnly; Secure; SameSite=Lax   (no tokens in JavaScript)
     ▼
 BFF (Node.js + Express 5)
     │  /login → redirect to IdP (code + PKCE, state, nonce)     /callback → exchange code, store tokens server-side
     │  CSRF token on state-changing requests · rate limiting · helmet security headers · CSP
     ▼  Authorization: Bearer <access token>
 Resource API (FastAPI or Express)
     │  validate JWT via JWKS (RS256/ES256 only, iss, aud, exp, nbf) → roles from claims
     │  RBAC + object-level checks (team ownership) on every request
     ▼
 PostgreSQL (expenses, teams)              Identity provider: local OIDC provider in dev, a free cloud tenant for the demo
```

## Milestones

### Milestone 1: identity provider and login

Goal: sign in with OIDC through the BFF.

- Development IdP: run a local OpenID provider in Node (the `oidc-provider` package) with test users, or use a free developer tenant from Auth0, Okta or Microsoft Entra ID.
- BFF `/login` builds the authorization request with PKCE (`S256`), `state` and `nonce`; `/callback` exchanges the code, validates the ID token, and creates a server-side session.
- Session cookie flags: HttpOnly, Secure, SameSite=Lax, short idle timeout.

Done when: you can sign in and out, the browser's storage contains no tokens, and replaying an old `state` fails.

### Milestone 2: the resource API and JWT validation

- The API fetches the IdP's JWKS (cached, refreshed on unknown `kid`), accepts only expected algorithms, and checks `iss`, `aud`, `exp` and `nbf` with small clock skew.
- Tests with locally signed tokens: wrong audience, expired, `alg: none`, HS256-signed with the public key (algorithm confusion), unknown `kid`: all rejected with 401.

Done when: every malformed-token test returns 401 and the valid one returns 200.

### Milestone 3: authorisation

- Roles from token claims mapped to permissions in one place.
- Object-level checks on every endpoint: an employee can read only their expenses, a manager only their team's, and only a manager of that team can approve.
- Return 404 rather than 403 for objects the caller may not know exist (and document why).

Done when: a BOLA test suite (user A requesting user B's expense IDs, a manager approving another team's expense) passes, meaning every attempt is refused.

### Milestone 4: web hardening

- CSRF protection for state-changing BFF routes (synchronizer token or double-submit), on top of SameSite cookies.
- helmet with a strict Content Security Policy (no inline scripts), HSTS, and a CORS allow-list on the API.
- Rate limiting on login and write endpoints; request size limits; zod or Pydantic validation on every input.
- Refresh token rotation and a real logout (revoke the session and end the IdP session).

Done when: a cross-site form post fails, securityheaders.com grades the demo A, and login brute force is throttled.

### Milestone 5: security automation and threat model

- GitHub Actions: `npm audit` / `pip-audit`, CodeQL, Dependabot, and an OWASP ZAP baseline scan against the app started in CI.
- `docs/threat-model.md`: assets, trust boundaries, STRIDE table, and how each threat is mitigated or accepted.

Done when: CI fails on a high-severity finding, and the threat model links to the tests that prove each control.

## Repository layout

```text
gatekeeper/
├── bff/                 # Express 5: OIDC client, sessions, CSRF, proxy to API
├── api/                 # FastAPI (or Express): JWT validation, RBAC, object-level checks
├── idp-dev/             # local oidc-provider setup with test users
├── web/                 # minimal UI
├── tests/security/      # token, BOLA, CSRF and header tests
├── docs/threat-model.md
├── compose.yaml
└── .github/workflows/{ci.yml,security.yml}
```

## Tests and CI

- **Token tests:** forged, expired, wrong `aud`/`iss`, `alg: none`, algorithm confusion, unknown `kid`.
- **Authorisation tests:** a matrix of role × action × ownership, including BOLA and privilege escalation attempts.
- **Web tests:** CSRF, CORS preflight from an unknown origin, security headers present.
- **Scans:** CodeQL, dependency audit and ZAP baseline on every PR.

```yaml
# .github/workflows/security.yml (outline)
on: [push, pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci && npm audit --audit-level=high
      - run: npm run start:test &   # BFF + API + dev IdP
      - uses: zaproxy/action-baseline@v0.15.0
        with: { target: "http://localhost:3000" }
```

(v0.15.0 is the latest release as of October 2026; check for newer before you use it.)

## README checklist

- Badges: CI, CodeQL, licence
- A sequence diagram of the login flow (browser → BFF → IdP → BFF → API)
- A table of controls: threat → control → test that proves it
- "Why a BFF" in five lines, and why tokens are not in the browser
- How to run locally with the dev IdP, and with a cloud tenant
- Screenshots of the ZAP report and the securityheaders.com grade
- What you would do next

Local development note: Docker Hub pulls currently fail on this Mac, so use Homebrew PostgreSQL and the Node-based dev IdP instead of a Keycloak container. Keep `compose.yaml` for readers of the repository.

## Stretch goals

- SAML 2.0 login alongside OIDC (your Passport.js SAML experience fits here)
- Multi-tenancy: tenant id in the token, enforced with PostgreSQL row-level security
- Step-up authentication for approvals above a threshold
- Sign and verify webhooks with HMAC and replay protection

## Talking about it in an interview

**60-second walkthrough:** "Gatekeeper is a small app I built to show how I secure web apps end to end. Login is OpenID Connect with the authorization code flow and PKCE, through a backend-for-frontend, so the browser only has an HttpOnly session cookie and no token JavaScript can steal. The API validates JWTs against the identity provider's keys, pinning the algorithm and checking audience and issuer, then enforces roles and object-level ownership on every request. I wrote attack tests: algorithm confusion, wrong audience, BOLA, CSRF. CI runs CodeQL, dependency audits and a ZAP baseline scan, and a threat model maps every threat to the test that proves the control."

- **Why not keep the access token in memory in the SPA?** It's better than localStorage, but any XSS can still use it while the page is open. A BFF keeps tokens server-side and the cookie can't be read by scripts.
- **Why return 404 instead of 403 for another user's object?** It avoids confirming the object exists. The important part is that the check happens on every request, server-side.
- **What is algorithm confusion?** An attacker signs a token with HS256 using the server's public key; a library that trusts the token's `alg` header verifies it. The fix is an algorithm allow-list per key.

## LinkedIn post template

> I built Gatekeeper, a small app secured the way enterprise systems should be, to practise identity and application security hands-on.
> OpenID Connect with PKCE through a backend-for-frontend (no tokens in the browser), strict JWT validation, role and object-level authorisation, CSRF protection and security headers.
> I attacked it too: algorithm-confusion, wrong-audience and BOLA tests, plus CodeQL and an OWASP ZAP scan in CI, mapped to a threat model.
> Code and threat model: <GitHub link>
> #appsec #oauth #oidc #owasp

## Resume bullet

Built Gatekeeper, an open-source OIDC/OAuth 2.0-secured app with a backend-for-frontend, strict JWT validation, RBAC and object-level authorisation, CSRF and CSP hardening, and automated security testing in CI (attack test suite, CodeQL, OWASP ZAP), documented with a STRIDE threat model.
