---
title: Enterprise identity, OAuth, OIDC, SAML and RBAC
goal: Explain and draw every login and token flow the platform needs, from a SAML or OIDC enterprise IdP down to role checks on a streaming connection, and defend each security choice.
minutes: 55
---

The JD asks you to "integrate backend services with enterprise identity providers (SAML/OAuth/OIDC) for role-based access control". In an enterprise agentic platform that means three questions keep coming back: how a user from the customer's identity provider (Okta, Microsoft Entra ID, Ping, Google Workspace) signs in to the React app, how every API, stream and agent tool call knows who that user is and what they may do, and how services authenticate to each other on Google Cloud without keys. Interviewers want you to draw the flows, name what must be validated, and explain the trade-offs (session cookie or token, SAML or OIDC, RBAC or ABAC).

You have real material here: SAML sign-in with Passport.js on the Quantiphi Document AI platform, JWT/OAuth2 at Medidata, and the role-based Admin UI functionality you added to the Labels Web application at The Dot Corp. Lead with those.

## The map

| Mechanism | What it is | Where it fits on this platform |
|---|---|---|
| Session cookie | Server keeps the session; the browser holds an opaque `HttpOnly` cookie | The SPA talking to its own backend-for-frontend (BFF) |
| JWT access token | Signed, self-contained token sent as `Authorization: Bearer` | APIs and microservices that verify identity without a database lookup |
| OAuth 2.0 | Framework for **authorisation**: issues access tokens to clients | "This app may call that API on the user's behalf"; machine-to-machine with client credentials |
| OpenID Connect | Identity layer on OAuth 2.0: adds the **ID token**, discovery and userinfo | Modern enterprise SSO with Okta, Entra ID, Google |
| SAML 2.0 | XML SSO: the IdP posts a signed assertion to the service provider | Enterprises that still standardise on SAML (very common) |
| mTLS | Both sides present certificates | Service-to-service and some enterprise APIs |
| Google service accounts | Workload identities with short-lived tokens from the metadata server | Cloud Run and GKE services calling Google APIs and each other |

## Three tokens, three jobs

| Token | Audience | Contains | Lifetime | Who reads it |
|---|---|---|---|---|
| ID token (OIDC) | Your client application | Who the user is: `sub`, `iss`, `aud`, `email`, `name`, `nonce`, maybe groups | Short (minutes) | Only the client that requested it; never send it to an API as an access token |
| Access token | The API (resource server) | What the bearer may do: scopes, roles, `aud` = the API | Short (5–60 minutes) | The API, which validates it on every request |
| Refresh token | The authorisation server | Opaque handle to get new access tokens | Hours to days, rotated on use | Only the authorisation server |

## Flows you must be able to draw

**Authorisation code with PKCE (the default for every client today):**

```text
SPA/BFF                      IdP (authorisation server)                 API
  | 1. create code_verifier, code_challenge = S256(verifier), state, nonce
  |---- 2. redirect /authorize?response_type=code&client_id&redirect_uri
  |        &scope=openid profile&state&nonce&code_challenge&code_challenge_method=S256 --->|
  |                       3. user signs in (password, MFA, federated SAML) and consents
  |<--- 4. redirect to redirect_uri?code=...&state=...  (check state matches)
  |---- 5. POST /token  code + code_verifier (+ client secret for a confidential BFF) --->|
  |<--- 6. id_token + access_token + refresh_token   (validate id_token: sig, iss, aud, exp, nonce)
  |---- 7. GET /runs  Authorization: Bearer <access_token> ------------------------------------>|
  |                                                    8. validate signature (JWKS), iss, aud, exp; check roles
```

**SAML 2.0, SP-initiated (what you built with Passport.js):**

```text
Browser            Service provider (your app)                     Identity provider
  |-- GET /app -------->| not signed in
  |<-- 302 to IdP SSO URL with SAMLRequest (deflated, base64, HTTP-Redirect binding) + RelayState
  |-- GET SSO URL ------------------------------------------------->| user signs in
  |<-- HTML form that auto-POSTs SAMLResponse (signed assertion) to the ACS URL (HTTP-POST binding)
  |-- POST /saml/acs -->| verify XML signature with the IdP certificate from metadata,
  |                     | check Issuer, Audience = SP entity ID, Recipient/Destination = ACS URL,
  |                     | NotBefore/NotOnOrAfter (+ small skew), InResponseTo = our request ID,
  |                     | assertion ID not seen before; read NameID and group attributes
  |<-- Set-Cookie session, 302 to RelayState
```

**Backend-for-frontend (BFF):** the BFF is a small server (for example a Node or FastAPI service on Cloud Run) that runs the OIDC or SAML flow as a confidential client, keeps the tokens server-side, and gives the browser only an `HttpOnly; Secure; SameSite` session cookie. The SPA calls the BFF, and the BFF attaches access tokens when it calls the APIs. No token ever lives in JavaScript, so an XSS bug cannot steal one.

## Identity on Google Cloud

- **Service accounts** are identities for workloads. A Cloud Run service or GKE pod runs as one and gets short-lived tokens from the metadata server: no key files.
- **Calling a private Cloud Run service** from another service: give the caller's service account `roles/run.invoker` on the target, fetch a Google-signed **ID token** with `audience` set to the target's URL, and send it as a bearer token. Cloud Run checks it before your code runs.
- **Workload Identity Federation** lets workloads outside Google Cloud (GitHub Actions, AWS, on-premises) exchange their own OIDC tokens for short-lived Google credentials, so CI needs no service account keys. **Workload Identity Federation for GKE** maps Kubernetes service accounts to IAM so pods get Google credentials without keys.
- **Identity-Aware Proxy (IAP)** puts Google sign-in and an IAM check in front of an app, then forwards a signed header (`x-goog-iap-jwt-assertion`) your app should verify. It can be enabled directly on a Cloud Run service (generally available since March 2026) or on an HTTPS load balancer in front of Cloud Run or GKE.
- **Identity Platform** is Google's customer identity service (it supports SAML and OIDC providers and multi-tenancy), and **Workforce Identity Federation** lets employees from an external IdP use Google Cloud itself.

```http
GET /computeMetadata/v1/instance/service-accounts/default/identity?audience=https://orchestrator-abc123-uc.a.run.app HTTP/1.1
Host: metadata.google.internal
Metadata-Flavor: Google
```

The response body is the ID token. Client libraries such as `google-auth` (`google.oauth2.id_token.fetch_id_token`) and `google-auth-library` for Node wrap this call and cache the token until shortly before it expires.

## Interview questions

### What is the difference between authentication and authorisation, and where does each happen on this platform? {core}

Authentication proves who the caller is; authorisation decides what that caller may do. On this platform authentication happens once at the edge: the user signs in through the customer's SAML or OIDC identity provider, and every later request carries a session or token that a service validates. Authorisation happens everywhere, on the server, for every request: the API checks roles before starting an agent run, the stream endpoint checks the user may watch that run, and the tool layer checks the agent is allowed to call that enterprise API on that user's behalf.

The point to make: hiding a button in React is user experience, not security. Every check must also exist on the server.

### Sessions or tokens: which would you choose? {core}

For the browser, a server-side session behind an `HttpOnly; Secure; SameSite` cookie, ideally in a backend-for-frontend. Sessions are easy to revoke (delete the row) and the cookie cannot be read by JavaScript. For APIs and service-to-service calls, short-lived JWT access tokens issued by the identity provider, because any service can verify them locally with the issuer's public keys.

The trade-off to name is statelessness against revocation. A JWT stays valid until it expires, so keep access tokens short (minutes), use refresh tokens with rotation, and keep a deny-list or session check for the rare cases where you must cut access immediately (an offboarded user, a stolen token).

### What is inside a JWT, and how do you validate one? {core}

A JWT is three base64url parts separated by dots: a header (algorithm, type and `kid`, the key ID), a payload of claims (`sub`, `iss`, `aud`, `exp`, `nbf`, `iat`, plus scopes, roles or groups), and a signature over the first two parts. It is signed, not encrypted, so anyone holding it can read the payload: never put secrets or sensitive personal data in it.

To validate: accept only the algorithm you expect (never let the header choose), find the issuer's public key in its JWKS by `kid`, verify the signature, then check `exp` and `nbf` with a small clock-skew leeway (30–60 seconds), `iss` equals your identity provider and `aud` equals your API. Only then read roles or scopes. Use a maintained library (`jose` or `jsonwebtoken` in Node, PyJWT or Authlib in Python, `google-auth` for Google-issued tokens).

```python
import base64
import json

# The payload is only base64url-encoded JSON: readable by anyone who holds the token.
token = (
    "eyJhbGciOiJSUzI1NiIsImtpZCI6ImtleS0yMDI2LTEwIiwidHlwIjoiSldUIn0"
    ".eyJzdWIiOiJ1c2VyLTQyIiwicm9sZXMiOlsib3BlcmF0b3IiXX0"
    ".signature-not-checked-here"
)
header_b64, payload_b64, _ = token.split(".")
pad = lambda s: s + "=" * (-len(s) % 4)
assert json.loads(base64.urlsafe_b64decode(pad(header_b64))) == {"alg": "RS256", "kid": "key-2026-10", "typ": "JWT"}
assert json.loads(base64.urlsafe_b64decode(pad(payload_b64))) == {"sub": "user-42", "roles": ["operator"]}
```

### What are the classic JWT mistakes? {deep}

Accepting `alg: none`; **algorithm confusion**, where a server expecting RS256 accepts an HS256 token whose HMAC secret is the server's own public key; skipping `exp`, `iss` or `aud` checks, so a token issued for another API is accepted; long-lived tokens with no way to revoke them; weak HMAC secrets; secrets or personal data in the payload; and not handling key rotation (always select the key by `kid` and refresh the JWKS when an unknown `kid` arrives, with a rate limit).

The fix for most of them is the same: pin the algorithm per issuer, validate every standard claim, and use a library configured with an explicit allow-list. RFC 8725 (JWT Best Current Practices) lists these.

### Walk me through the authorisation code flow with PKCE. {core}

The client redirects the user to the identity provider's `/authorize` endpoint with its client ID, redirect URI, scopes, a random `state`, and a PKCE `code_challenge`: the SHA-256 hash of a random `code_verifier` it keeps. The user signs in, the IdP redirects back with a short-lived authorisation code, and the client exchanges the code plus the original `code_verifier` at the `/token` endpoint for an ID token, an access token and usually a refresh token.

PKCE means a stolen authorisation code is useless without the verifier, and `state` stops an attacker from injecting their own code into your session (login CSRF). The OAuth 2.0 Security Best Current Practice (RFC 9700, January 2025) makes PKCE mandatory for public clients such as SPAs and recommends it for confidential ones, says the implicit grant should not be used, and forbids the resource owner password grant. OIDC adds a `nonce` that comes back inside the ID token, which ties the token to this login attempt.

### What is the difference between an ID token and an access token?

The ID token is for the client: it tells your application who signed in, and its audience is your client ID. The access token is for the API: it tells the resource server what the bearer may do, and its audience is the API. Sending an ID token to an API as if it were an access token is a common mistake, because the API would be accepting a token that was never issued for it.

In practice the React app or BFF reads the ID token to create the session and show the user's name, and attaches the access token (never the ID token) when it calls the orchestration API.

### OAuth 2.0 vs OpenID Connect vs SAML: what is the difference? {core}

OAuth 2.0 is an authorisation framework: it issues access tokens so a client can call an API, and it does not define a standard way to say who the user is. OpenID Connect adds authentication on top: the ID token (a JWT about the user), discovery metadata at `/.well-known/openid-configuration`, a JWKS URL and a userinfo endpoint. SAML 2.0 is an older, XML-based SSO standard where the IdP sends a signed assertion through the browser to the service provider.

| | SAML 2.0 | OpenID Connect |
|---|---|---|
| Format | XML assertions, XML Signature | JSON, JWTs |
| Transport | Browser redirects and auto-submitted POST forms | Redirects plus back-channel REST calls |
| APIs and mobile | Poor fit: assertions are for browser SSO | Natural fit: the same IdP issues access tokens |
| Configuration | Exchange metadata XML (entity IDs, ACS URL, certificates) | Discovery URL, client ID and secret |
| Typical use | Established enterprise and government SSO | New apps, SPAs, mobile, APIs |

### Walk me through a SAML login you implemented, and what the service provider must validate. {core}

On the Document AI platform at Quantiphi I implemented SAML-based authentication with Passport.js on Node.js. The usual flow is service-provider-initiated: the app redirects the unauthenticated user to the IdP with a SAML AuthnRequest, the user signs in there, and the IdP returns an HTML form that posts a signed SAMLResponse to the app's assertion consumer service (ACS) URL. Passport's SAML strategy validates the response, the app maps the NameID and attributes to a user, creates a session, and redirects to where the user started (the RelayState).

What the SP must check, in order: the XML signature with the IdP's certificate from its metadata (and that the signed element is the assertion you then read, to defeat XML signature wrapping); the Issuer; the Audience equals your SP entity ID; the Recipient or Destination equals your ACS URL; NotBefore and NotOnOrAfter with a small skew; InResponseTo matches a request you actually sent; and the assertion ID has not been used before (replay). Libraries do most of this when configured correctly, but you must configure the certificate, audience and callback URL, and keep the library patched: XML signature wrapping and parser-differential bugs still appear in SAML libraries.

**Your angle:** describe the Passport.js SAML authentication you implemented at Quantiphi, alongside the secure GCS signed-URL access for document rendering. Keep to what you built and remember; do not claim IdP-side administration you did not do.

### A customer's IdP supports both SAML and OIDC. Which do you integrate? {deep}

OIDC, if the platform can choose: it is JSON and JWT based, works for the SPA, mobile and APIs with one IdP, uses discovery and JWKS so certificate rotation is automatic, and the same flow can issue access tokens for your APIs. SAML is still the right answer when the customer's security team mandates it or already has a SAML app catalogue, and many enterprises do.

The architecture should not care: put a broker in the middle (Identity Platform, Auth0, Keycloak or your own BFF) that accepts SAML or OIDC from each customer and issues your platform's own OIDC tokens and sessions. Then every service validates one token format, and adding a customer is configuration, not code.

### What is the backend-for-frontend pattern, and why do SPAs use it? {core}

A BFF is a thin server that belongs to the front end: it runs the OIDC or SAML login as a confidential client, stores the access and refresh tokens server-side, and gives the browser only an `HttpOnly; Secure; SameSite` session cookie. The React app calls the BFF with that cookie, and the BFF calls the backend APIs with the right access token.

It exists because anything JavaScript can read, an XSS bug can steal: tokens in `localStorage` or `sessionStorage` are exposed to every script on the page. With a BFF there is no token in the browser, refresh happens server-side, and you get one place to apply CSRF protection (SameSite plus an anti-CSRF header). The cost is one more service and sticky cookie-based sessions; if an SPA must hold tokens, keep the access token in memory, short-lived, with refresh-token rotation.

### How should refresh tokens work? {deep}

Refresh tokens are long-lived credentials that only the authorisation server reads, used to get new short-lived access tokens without another sign-in. Best practice is **rotation**: every use returns a new refresh token and invalidates the old one, and if an old one is ever presented again the server treats it as theft and revokes the whole token family. For public clients RFC 9700 requires refresh tokens to be either sender-constrained (DPoP, RFC 9449, or mTLS) or rotated.

Also bound them: an absolute lifetime (for example a working day for an operations console), an idle timeout, revocation on sign-out (RFC 7009) and when the user is disabled in the IdP.

### How do services authenticate to each other on Google Cloud? {core}

With service accounts and short-lived tokens, never key files. Each Cloud Run service or GKE workload runs as its own service account. To call a private Cloud Run service, the caller fetches a Google-signed ID token from the metadata server with the audience set to the target URL and sends it as a bearer token; Cloud Run checks it and the `roles/run.invoker` IAM binding before the request reaches your code. To call Google APIs (Pub/Sub, Secret Manager, Firestore) the client libraries fetch OAuth access tokens for the service account automatically.

For workloads outside Google Cloud, such as GitHub Actions deploying to Cloud Run, use Workload Identity Federation: the CI job's own OIDC token is exchanged for short-lived Google credentials. On GKE, Workload Identity Federation for GKE gives each Kubernetes service account an IAM identity. Grant each identity only the roles it needs.

### What is RBAC vs ABAC vs ReBAC? {core}

RBAC grants permissions through roles: viewer, operator, approver, admin. It is simple and auditable, and it maps neatly from IdP groups. ABAC decides from attributes of the user, the resource and the context: same tenant, owner of the run, cost of the action, time of day. ReBAC (relationship-based, as in Google's Zanzibar paper, OpenFGA and SpiceDB) decides from relationships: this user is a member of the team that owns this workspace.

Real systems combine them. A role gates the action ("operators may cancel runs"), and attribute or relationship checks gate the specific object ("only runs in your tenant, and only your own unless you are an admin"). For agent actions add separation of duties: the person who started a run that needs approval should not be the one who approves it.

**Your angle:** the role-based Admin UI functionality you added to the Labels Web application at The Dot Corp, for managing carrier accounts and credentials. If you know how the permission was enforced on the server, say so; if that part was outside your change, describe what you built and add that the server must enforce the same rule, not just hide the UI.

### How do you map enterprise IdP groups to application roles? {deep}

Do not hard-code IdP group names in code. Receive groups (or app roles) as claims in the ID token or SAML attributes, and keep a per-tenant mapping table from IdP group to platform role, managed by the tenant's admin. Resolve roles at sign-in or token issue and put them in your own session or access token, so services check stable platform roles, not each customer's naming.

Watch for the details interviewers like: large users can exceed group-claim limits (Entra ID, for example, then sends a pointer instead of the groups, and you must query the directory), so prefer app-role assignments where the IdP supports them; group changes only take effect at the next sign-in, so keep sessions bounded; and use SCIM provisioning so deprovisioned users are disabled in your platform promptly instead of keeping access until their tokens expire.

### How do you keep tenants isolated in a multi-tenant platform? {deep}

The tenant comes from the authenticated identity (a claim set by your broker at sign-in), never from a request parameter or body. Every query is scoped by tenant, every cache key and storage path includes the tenant, and object IDs are checked against the tenant on every access, so changing `/runs/123` to someone else's ID returns 404. That last one is broken object level authorisation, number one on the OWASP API Security Top 10.

As defence in depth in PostgreSQL, row-level security can enforce the tenant filter inside the database. The API sets the tenant per transaction from the verified token, and the policy filters every query and rejects writes into another tenant:

```sql postgres
CREATE TABLE agent_runs (
  id int PRIMARY KEY,
  tenant_id text NOT NULL,
  title text NOT NULL
);
INSERT INTO agent_runs VALUES
  (1, 'acme', 'Reconcile invoices'),
  (2, 'acme', 'Draft purchase order'),
  (3, 'globex', 'Rotate API keys');
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
-- current_setting(..., true) is NULL when no tenant is set, so the policy then matches no rows.
CREATE POLICY tenant_isolation ON agent_runs
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
```

Superusers and the table owner bypass RLS (use a separate application role, and `FORCE ROW LEVEL SECURITY` if the owner must be filtered too). So the demo switches to a plain role inside a transaction that is rolled back, which also removes the role again:

```sql postgres
BEGIN;
CREATE ROLE lab_rls_api NOLOGIN;
GRANT SELECT, INSERT ON agent_runs TO lab_rls_api;
SET LOCAL ROLE lab_rls_api;
DO $$ BEGIN
  IF (SELECT count(*) FROM agent_runs) <> 0 THEN RAISE EXCEPTION 'no tenant set: expected no rows'; END IF;
END $$;
SET LOCAL app.tenant_id = 'acme';
DO $$ BEGIN
  IF (SELECT count(*) FROM agent_runs) <> 2 THEN RAISE EXCEPTION 'acme should see exactly its 2 runs'; END IF;
  IF EXISTS (SELECT 1 FROM agent_runs WHERE id = 3) THEN RAISE EXCEPTION 'globex run leaked'; END IF;
  BEGIN
    INSERT INTO agent_runs VALUES (4, 'globex', 'Smuggled row');
    RAISE EXCEPTION 'cross-tenant insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- WITH CHECK rejected it: "new row violates row-level security policy"
  END;
END $$;
ROLLBACK;
```

```sql postgres
SELECT count(*) FROM pg_roles WHERE rolname = 'lab_rls_api'
-- expect: [(0,)]
```

For per-tenant identity providers, Identity Platform's multi-tenancy or a broker keeps each tenant's SAML or OIDC configuration separate.

### How do you authenticate WebSocket and SSE connections? {core}

The browser's `WebSocket` and `EventSource` APIs cannot set an `Authorization` header, so there are four options. **Cookies**: the session cookie is sent on the upgrade request and on same-site SSE, which works well with a BFF, but you must check the `Origin` header on the WebSocket upgrade or any site can open a socket with the user's cookie (cross-site WebSocket hijacking). **A short-lived ticket**: the app calls an authenticated REST endpoint, gets a one-time ticket valid for about 30 seconds, and passes it in the URL; the server consumes it on connect. **A token in the first message**: accept the socket, require an auth message within a few seconds, and close otherwise. **fetch-based SSE**: reading the stream with `fetch` and a `ReadableStream` lets you send a normal `Authorization` header.

Avoid long-lived tokens in query strings, because URLs end up in logs. Authorise the subscription too, not just the connection: being signed in does not mean you may watch someone else's run.

```python
import secrets
import time

from fastapi import FastAPI, Header, HTTPException, WebSocket
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

app = FastAPI()
SESSIONS = {"session-abc": {"user": "u1", "tenant": "acme"}}
TICKETS: dict[str, tuple[dict, float]] = {}  # ticket -> (user, expires_at); Redis with a TTL in production
ALLOWED_ORIGINS = {"https://console.example.com"}


@app.post("/stream-tickets")
def issue_ticket(authorization: str = Header()) -> dict:
    user = SESSIONS.get(authorization.removeprefix("Bearer "))
    if user is None:
        raise HTTPException(401, "Not authenticated")
    ticket = secrets.token_urlsafe(32)
    TICKETS[ticket] = (user, time.monotonic() + 30)
    return {"ticket": ticket}


@app.websocket("/runs/{run_id}/stream")
async def run_stream(websocket: WebSocket, run_id: str, ticket: str = ""):
    entry = TICKETS.pop(ticket, None)  # one-time use: pop, not get
    origin_ok = websocket.headers.get("origin") in ALLOWED_ORIGINS
    if entry is None or entry[1] < time.monotonic() or not origin_ok:
        # Closing before accept() refuses the handshake (HTTP 403); a browser only sees close code 1006.
        await websocket.close(code=1008)  # 1008 = policy violation
        return
    user = entry[0]
    await websocket.accept()
    await websocket.send_json({"run": run_id, "watcher": user["user"], "event": "subscribed"})
    await websocket.close()


client = TestClient(app)
origin = {"origin": "https://console.example.com"}
ticket = client.post("/stream-tickets", headers={"Authorization": "Bearer session-abc"}).json()["ticket"]
with client.websocket_connect(f"/runs/r-7/stream?ticket={ticket}", headers=origin) as ws:
    assert ws.receive_json() == {"run": "r-7", "watcher": "u1", "event": "subscribed"}

for url, headers in [
    (f"/runs/r-7/stream?ticket={ticket}", origin),  # replayed ticket
    ("/runs/r-7/stream?ticket=forged", origin),  # unknown ticket
]:
    try:
        with client.websocket_connect(url, headers=headers):
            raise AssertionError("should be rejected")
    except WebSocketDisconnect as closed:
        assert closed.code == 1008

fresh = client.post("/stream-tickets", headers={"Authorization": "Bearer session-abc"}).json()["ticket"]
try:
    with client.websocket_connect(f"/runs/r-7/stream?ticket={fresh}", headers={"origin": "https://evil.example"}):
        raise AssertionError("cross-site socket accepted")
except WebSocketDisconnect as closed:
    assert closed.code == 1008
```

A real handler would also check that `user` may watch `run_id` (same tenant, permission to view) before accepting.

### What happens when the user's token expires in the middle of a long stream? {deep}

The connection was authenticated when it opened, so nothing stops it by itself; you need a policy. Common choices: the server tracks the session or token expiry and closes the socket with an application close code (in the 4000–4999 private range, for example 4001 "re-authenticate") when it passes, and the client gets a fresh ticket and reconnects, resuming from the last event ID; or the client sends a refreshed token as a message over the open socket before expiry, and the server re-validates it.

Also re-check authorisation on events that matter: if a user is removed from a tenant, revoke their open subscriptions through a pub/sub "session revoked" message rather than waiting for expiry. For SSE, the reconnect with `Last-Event-ID` makes the "close and reconnect" policy almost free.

### When an agent calls an enterprise API, whose identity should it use? {deep}

It depends on the action, and the senior answer is "never a broad shared super-account". For actions taken on a user's behalf (create a ticket, read their records), the agent should act with a **delegated, down-scoped** credential: OAuth token exchange (RFC 8693) or the provider's on-behalf-of flow turns the user's token into one for the downstream API with only the scopes this tool needs, so the enterprise system's own permissions and audit apply to the real user. For background actions with no user, the agent uses its own service identity with narrow roles.

Either way, log both identities ("agent X acting for user Y, run Z"), keep tool permissions per tool, and require human approval before high-impact actions. OWASP lists identity and privilege abuse and excessive agency among the top risks for LLM and agentic applications.

### What is Identity-Aware Proxy, and when would you use it? {deep}

IAP is Google Cloud's managed authentication proxy: it signs users in with Google identities (including workforce users federated from another IdP), checks an IAM permission, and only then forwards the request to your app with a signed JWT header, `x-goog-iap-jwt-assertion`. It can be enabled directly on a Cloud Run service or on an HTTPS load balancer in front of Cloud Run, GKE or Compute Engine.

It is ideal for internal tools and operations consoles, because you get SSO and access control with no login code. Your app should still verify the IAP header (signature and audience) so a misconfiguration cannot bypass it, and you still do your own fine-grained authorisation inside the app. For a customer-facing multi-tenant platform with each customer's own SAML or OIDC IdP, a broker such as Identity Platform is usually the better fit.

### What are the main points of the OAuth 2.0 Security Best Current Practice (RFC 9700)? {deep}

Published in January 2025, it updates the original OAuth threat model. The headline rules: use the authorisation code grant, with PKCE required for public clients and recommended for confidential ones; do not use the implicit grant, and never the resource owner password grant; match redirect URIs exactly (no wildcards); prevent CSRF with PKCE or `state`; give access tokens a narrow audience and scope; sender-constrain tokens (mTLS or DPoP) where possible; and for public clients, sender-constrain or rotate refresh tokens.

These rules are also what OAuth 2.1 consolidates. If asked, mention that you would rather configure a mature library or broker correctly than write any of this by hand.

### How do you handle sign-out across SSO? {deep}

Clear your own session and revoke the refresh token first: that is what actually stops access to your platform. Then, if the customer wants global sign-out, use the IdP's mechanism: OIDC RP-initiated logout (redirect to the IdP's `end_session_endpoint`) and back-channel logout (the IdP calls your server with a logout token, so you can kill sessions even when the browser is gone), or SAML Single Logout.

Be clear in the interview that signing out of your app does not sign the user out of their corporate IdP, and that is usually what enterprises want. Open WebSockets and SSE streams for that session should be closed through the same session-revocation event.

## Coding problems

### Sign and verify an HS256 JWT with only the standard library {medium core}

Write `sign(payload, secret)` that produces a compact JWT with HS256, and `verify(token, secret, *, issuer, audience, now)` that returns the payload only if the signature is valid, the algorithm is HS256, the token is not expired or not yet valid (allow 30 seconds of clock skew), and `iss` and `aud` match. Raise `ValueError` with a short reason otherwise. (Production code uses a library; this shows you understand the format.)

```text
token = sign({"sub": "u1", "iss": "https://idp.example", "aud": "orchestrator", "exp": 2000}, "s3cret")
verify(token, "s3cret", issuer="https://idp.example", audience="orchestrator", now=1000) → payload
verify(..., now=3000)            → ValueError("expired")
verify(..., audience="billing")  → ValueError("wrong audience")
```

#### Hints

1. The token is `base64url(header).base64url(payload).base64url(signature)`, and base64url drops the `=` padding.
2. The signature is HMAC-SHA256 over the ASCII bytes of `header.payload`. Compare with `hmac.compare_digest`.
3. Check the algorithm and the signature before you trust any claim; `aud` may be a string or a list.

#### Solution

Encode the header and payload as compact JSON, base64url them without padding, and sign the joined string. Verification first refuses any algorithm other than HS256, recomputes the signature and compares in constant time, and only then reads the claims and checks time and audience.

```python
import base64
import hashlib
import hmac
import json

LEEWAY = 30


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign(payload: dict, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = ".".join(b64url_encode(json.dumps(p, separators=(",", ":")).encode()) for p in (header, payload))
    signature = hmac.new(secret.encode(), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{b64url_encode(signature)}"


def verify(token: str, secret: str, *, issuer: str, audience: str, now: float) -> dict:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("malformed token")
    header_b64, payload_b64, signature_b64 = parts
    header = json.loads(b64url_decode(header_b64))
    if not isinstance(header, dict) or header.get("alg") != "HS256":  # the token never chooses the algorithm
        raise ValueError("unexpected algorithm")
    expected = hmac.new(secret.encode(), f"{header_b64}.{payload_b64}".encode("ascii"), hashlib.sha256).digest()
    if not hmac.compare_digest(expected, b64url_decode(signature_b64)):
        raise ValueError("bad signature")
    claims = json.loads(b64url_decode(payload_b64))
    if not isinstance(claims, dict):
        raise ValueError("malformed token")
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)) or now >= exp + LEEWAY:
        raise ValueError("expired")
    if now < claims.get("nbf", now) - LEEWAY:
        raise ValueError("not yet valid")
    if claims.get("iss") != issuer:
        raise ValueError("wrong issuer")
    aud = claims.get("aud")
    if audience not in (aud if isinstance(aud, list) else [aud]):
        raise ValueError("wrong audience")
    return claims


claims = {"sub": "u1", "iss": "https://idp.example", "aud": "orchestrator", "exp": 2000}
token = sign(claims, "s3cret")
ok = dict(issuer="https://idp.example", audience="orchestrator")
assert token.count(".") == 2 and "=" not in token
assert verify(token, "s3cret", **ok, now=1000) == claims
assert verify(token, "s3cret", **ok, now=2010) == claims  # inside the clock-skew leeway


def reason(fn) -> str:
    try:
        fn()
    except ValueError as error:
        return str(error)
    return "accepted"


assert reason(lambda: verify(token, "s3cret", **ok, now=3000)) == "expired"
assert reason(lambda: verify(token, "wrong", **ok, now=1000)) == "bad signature"
assert reason(lambda: verify(token, "s3cret", issuer="https://idp.example", audience="billing", now=1000)) == "wrong audience"
assert reason(lambda: verify(sign({**claims, "nbf": 1500}, "s3cret"), "s3cret", **ok, now=1000)) == "not yet valid"
assert reason(lambda: verify(sign({**claims, "aud": ["billing", "orchestrator"]}, "s3cret"), "s3cret", **ok, now=1000)) == "accepted"
assert reason(lambda: verify(sign({k: v for k, v in claims.items() if k != "exp"}, "s3cret"), "s3cret", **ok, now=1000)) == "expired"

# Tampering with the payload breaks the signature; an unsigned "alg: none" token is refused first.
h, _, s = token.split(".")
forged = f"{h}.{b64url_encode(json.dumps({**claims, 'sub': 'admin'}).encode())}.{s}"
assert reason(lambda: verify(forged, "s3cret", **ok, now=1000)) == "bad signature"
none_header = b64url_encode(json.dumps({"alg": "none"}).encode())
assert reason(lambda: verify(f"{none_header}.{token.split('.')[1]}.", "s3cret", **ok, now=1000)) == "unexpected algorithm"
assert reason(lambda: verify(sign({**claims, "exp": "2000"}, "s3cret"), "s3cret", **ok, now=1000)) == "expired"  # exp must be a number
assert reason(lambda: verify("not-a-jwt", "s3cret", **ok, now=1000)) == "malformed token"
```

Complexity: O(n) in the token length. The security comes from the fixed algorithm, the constant-time comparison and checking the signature before using any claim. A token without `exp` is refused, because a token that never expires should not exist.

#### Follow-ups

- **Why do identity providers use RS256 or ES256 instead?** Only the issuer holds the private key; every API verifies with the public key from the JWKS, so no shared secret is spread across services.
- **Why is a missing `exp` an error here?** Never-expiring bearer tokens cannot be contained after a leak. Some libraries accept tokens without `exp` by default, so require it explicitly.

### Verify an RS256 token against a JWKS, selecting the key by kid {medium core}

The identity provider signs access tokens with RS256 and publishes its public keys as a JWKS (`{"keys": [{"kid": ..., "kty": "RSA", "n": ..., "e": ...}]}`). Write `verifyJwt(token, jwks, { issuer, audience, now })` in TypeScript using `node:crypto`. It must refuse any algorithm except RS256 (including the HS256 algorithm-confusion attack), pick the key by `kid`, and check `exp`, `iss` and `aud`.

#### Hints

1. `createPublicKey({ key: jwk, format: 'jwk' })` turns a JWK into a key object, and `verify('sha256', data, key, signature)` checks an RS256 (RSASSA-PKCS1-v1_5) signature.
2. Read the header to get `alg` and `kid`, but decide yourself which algorithm is allowed.
3. Unknown `kid`: in production, refetch the JWKS once (rate-limited) to pick up a rotated key, then fail.

#### Solution

The issuer side generates a key pair and signs with the private key; the API side only ever sees the JWKS. Verification checks `alg` against a fixed allow-list, looks the key up by `kid`, verifies the signature over `header.payload`, and then validates the claims.

```ts
import assert from 'node:assert/strict';
import { createHmac, createPublicKey, generateKeyPairSync, sign, verify, type webcrypto } from 'node:crypto';

type Jwk = webcrypto.JsonWebKey & { kid: string };
type Claims = { sub: string; iss: string; aud: string | string[]; exp: number; roles?: string[] };

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url');
const json = (part: string): Record<string, unknown> => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

export function verifyJwt(token: string, jwks: { keys: Jwk[] }, opts: { issuer: string; audience: string; now: number }): Claims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [h, p, s] = parts;
  const header = json(h);
  if (header.alg !== 'RS256') throw new Error('unexpected algorithm');
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown key');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  if (!verify('sha256', Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) throw new Error('bad signature');
  const claims = json(p) as Claims;
  if (typeof claims.exp !== 'number' || opts.now >= claims.exp + 30) throw new Error('expired');
  if (claims.iss !== opts.issuer) throw new Error('wrong issuer');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(opts.audience)) throw new Error('wrong audience');
  return claims;
}

// --- Issuer side (normally the identity provider) ---
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = 'key-2026-10';
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }] };

function issue(claims: Claims, headerKid = kid): string {
  const input = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: headerKid }))}.${b64url(JSON.stringify(claims))}`;
  return `${input}.${b64url(sign('sha256', Buffer.from(input), privateKey))}`;
}

const claims: Claims = { sub: 'u1', iss: 'https://idp.example', aud: 'orchestrator', exp: 2000, roles: ['operator'] };
const opts = { issuer: 'https://idp.example', audience: 'orchestrator', now: 1000 };
const token = issue(claims);

assert.deepEqual(verifyJwt(token, jwks, opts), claims);
assert.throws(() => verifyJwt(token, jwks, { ...opts, now: 5000 }), /expired/);
assert.throws(() => verifyJwt(token, jwks, { ...opts, audience: 'billing' }), /wrong audience/);
assert.throws(() => verifyJwt(issue(claims, 'old-key'), jwks, opts), /unknown key/);

// Tampered payload: same signature, different claims.
const [h, , s] = token.split('.');
assert.throws(() => verifyJwt(`${h}.${b64url(JSON.stringify({ ...claims, roles: ['admin'] }))}.${s}`, jwks, opts), /bad signature/);

// Algorithm confusion: the attacker HMACs a token with the public key PEM as the "secret".
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const evilInput = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid }))}.${b64url(JSON.stringify({ ...claims, roles: ['admin'] }))}`;
const evil = `${evilInput}.${createHmac('sha256', pem).update(evilInput).digest('base64url')}`;
assert.throws(() => verifyJwt(evil, jwks, opts), /unexpected algorithm/);
```

Complexity: one RSA verification per request; cache the imported key objects by `kid` instead of calling `createPublicKey` every time.

#### Follow-ups

- **How do you handle key rotation?** The IdP publishes the new key alongside the old one before signing with it; you cache the JWKS (respecting cache headers) and refetch on an unknown `kid`, with a rate limit so attackers cannot make you hammer the IdP.
- **ES256 instead?** Same flow with an EC key; `verify` needs `{ key, dsaEncoding: 'ieee-p1363' }`, because JWS signatures are raw r‖s, not DER.

### Implement PKCE for a sign-in redirect and the token exchange {easy}

Write TypeScript helpers for PKCE (RFC 7636): `newVerifier()` returns a random verifier, `challengeS256(verifier)` returns the challenge, `authorizeUrl(...)` builds the `/authorize` URL, and a tiny fake authorisation server stores the challenge with the issued code and only redeems the code when the right verifier is presented, once.

#### Hints

1. The verifier is 43–128 characters from `[A-Za-z0-9-._~]`; 32 random bytes in base64url give exactly 43.
2. The challenge is `BASE64URL(SHA256(ASCII(verifier)))` without padding. Test it against the RFC 7636 Appendix B example.
3. Codes are single use: delete the code when it is redeemed, whether or not the verifier matched.

#### Solution

```ts
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

export const newVerifier = () => randomBytes(32).toString('base64url');
export const challengeS256 = (verifier: string) => createHash('sha256').update(verifier, 'ascii').digest('base64url');

export function authorizeUrl(base: string, p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL('/authorize', base);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: 'openid profile email',
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

// A fake authorisation server: remembers the challenge for each code it issues.
const pending = new Map<string, { challenge: string; redirectUri: string }>();
function issueCode(challenge: string, redirectUri: string): string {
  const code = randomBytes(16).toString('base64url');
  pending.set(code, { challenge, redirectUri });
  return code;
}
function redeem(code: string, verifier: string, redirectUri: string): string {
  const entry = pending.get(code);
  pending.delete(code); // single use, even on failure
  if (!entry || entry.redirectUri !== redirectUri || challengeS256(verifier) !== entry.challenge) throw new Error('invalid_grant');
  return 'access-token-for-' + code.slice(0, 4);
}

// RFC 7636, Appendix B.
assert.equal(challengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');

const verifier = newVerifier();
assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
const url = new URL(authorizeUrl('https://idp.example', { clientId: 'console', redirectUri: 'https://app.example/cb', state: 'xyz', challenge: challengeS256(verifier) }));
assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
assert.equal(url.searchParams.get('redirect_uri'), 'https://app.example/cb');

const code = issueCode(challengeS256(verifier), 'https://app.example/cb');
assert.throws(() => redeem(code, newVerifier(), 'https://app.example/cb'), /invalid_grant/); // stolen code, wrong verifier
const code2 = issueCode(challengeS256(verifier), 'https://app.example/cb');
assert.match(redeem(code2, verifier, 'https://app.example/cb'), /^access-token-for-/);
assert.throws(() => redeem(code2, verifier, 'https://app.example/cb'), /invalid_grant/); // replayed code
```

Complexity: constant per sign-in. In the browser the same hash comes from `crypto.subtle.digest('SHA-256', ...)`, which is async.

#### Follow-ups

- **Where does the verifier live between the redirect and the callback?** In `sessionStorage` for a pure SPA, or server-side in the BFF's pre-login session, together with `state` and `nonce`.
- **Why still send `state` if PKCE exists?** It carries where to return the user, and RFC 9700 allows PKCE to replace it for CSRF protection only when the server is known to enforce PKCE; sending both is cheap.

### Authorise agent-run actions with roles, tenants and separation of duties {medium core}

Implement `authorize(user, action, run)` for the orchestration API. Users have a tenant and IdP groups; a per-tenant table maps groups to roles (`viewer`, `operator`, `approver`, `admin`). Rules: `run:view` needs any role; `run:start` needs operator or above; `run:cancel` needs operator for your own runs, admin for anyone's; `run:approve` needs approver or admin and you may not approve a run you started. Everything requires the same tenant. Return `(allowed, reason)`.

#### Hints

1. Resolve roles first: map the user's groups through the user's own tenant mapping. Unknown groups grant nothing.
2. Check the tenant before anything else, and return the same "not found" for a foreign run as for a missing one.
3. Express each action as a small function of (roles, user, run), so new rules do not tangle the others.

#### Solution

```python
from dataclasses import dataclass

GROUP_ROLES = {  # per tenant: IdP group -> platform role, managed by each tenant's admin
    "acme": {"okta-ops": "operator", "okta-finance-leads": "approver", "okta-platform-admins": "admin", "okta-all": "viewer"},
    "globex": {"entra-ai-users": "operator"},
}
RANK = {"viewer": 1, "operator": 2, "approver": 3, "admin": 4}


@dataclass(frozen=True)
class User:
    id: str
    tenant: str
    groups: frozenset[str]


@dataclass(frozen=True)
class Run:
    id: str
    tenant: str
    started_by: str


def roles_of(user: User) -> set[str]:
    mapping = GROUP_ROLES.get(user.tenant, {})
    return {mapping[g] for g in user.groups if g in mapping}


def has_at_least(roles: set[str], role: str) -> bool:
    return any(RANK[r] >= RANK[role] for r in roles)


def authorize(user: User, action: str, run: Run) -> tuple[bool, str]:
    if run.tenant != user.tenant:
        return False, "not found"  # never confirm another tenant's run exists
    roles = roles_of(user)
    if not roles:
        return False, "no role"
    own = run.started_by == user.id
    if action == "run:view":
        return True, "ok"
    if action == "run:start":
        return (True, "ok") if has_at_least(roles, "operator") else (False, "needs operator")
    if action == "run:cancel":
        if "admin" in roles or (own and has_at_least(roles, "operator")):
            return True, "ok"
        return False, "only your own runs"
    if action == "run:approve":
        if not ({"approver", "admin"} & roles):
            return False, "needs approver"
        return (False, "cannot approve your own run") if own else (True, "ok")
    return False, "unknown action"  # deny by default


ops = User("u1", "acme", frozenset({"okta-ops", "okta-all"}))
lead = User("u2", "acme", frozenset({"okta-finance-leads"}))
admin = User("u3", "acme", frozenset({"okta-platform-admins"}))
nobody = User("u4", "acme", frozenset({"marketing"}))
outsider = User("u9", "globex", frozenset({"entra-ai-users"}))
mine = Run("r1", "acme", started_by="u1")
leads_run = Run("r2", "acme", started_by="u2")

assert roles_of(ops) == {"operator", "viewer"}
assert authorize(ops, "run:start", mine) == (True, "ok")
assert authorize(ops, "run:cancel", mine) == (True, "ok")
assert authorize(ops, "run:cancel", leads_run) == (False, "only your own runs")
assert authorize(admin, "run:cancel", leads_run) == (True, "ok")
assert authorize(lead, "run:approve", mine) == (True, "ok")
assert authorize(lead, "run:approve", leads_run) == (False, "cannot approve your own run")
assert authorize(ops, "run:approve", leads_run) == (False, "needs approver")
assert authorize(nobody, "run:view", mine) == (False, "no role")
assert authorize(outsider, "run:view", mine) == (False, "not found")
assert authorize(admin, "run:delete-everything", mine) == (False, "unknown action")
```

Complexity: O(g) in the user's groups. In a service you would resolve roles once at sign-in and carry them in the session or token.

#### Follow-ups

- **Where would this live?** In one policy module (or a policy engine such as OPA/Cedar, or OpenFGA for relationships) called by every endpoint and by the agent tool layer, with unit tests per rule.
- **How do you audit it?** Log every denied and every allowed high-impact decision with user, tenant, action, run and reason.

### Check a SAML assertion's conditions after signature verification {medium}

Your SAML library has verified the XML signature and hands you the signed `<saml:Assertion>`. Write `check_assertion(xml, now)` that enforces the rest: the Issuer is the expected IdP, the Audience is your SP entity ID, the bearer SubjectConfirmationData has your ACS URL as Recipient, is not expired and answers a request you sent (InResponseTo), the Conditions time window holds (60 seconds of skew), and the assertion ID has not been seen before. Return the NameID and groups.

#### Hints

1. Use `xml.etree.ElementTree` with the namespace map `{"saml": "urn:oasis:names:tc:SAML:2.0:assertion"}`. Times end in `Z`; `datetime.fromisoformat` handles that.
2. Keep two stores: pending request IDs (consumed on use) and seen assertion IDs (kept until the assertion would expire anyway).
3. Collect the group values from the `Attribute` whose `Name` is `groups`.

#### Solution

```python
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

NS = {"saml": "urn:oasis:names:tc:SAML:2.0:assertion"}
IDP = "https://idp.acme.example/saml"
SP_ENTITY_ID = "https://platform.example/saml/metadata"
ACS_URL = "https://platform.example/saml/acs"
SKEW = timedelta(seconds=60)


class SamlError(ValueError):
    pass


def ts(value: str) -> datetime:
    return datetime.fromisoformat(value)


def check_assertion(xml: str, now: datetime, pending: set[str], seen: dict[str, datetime]) -> dict:
    a = ET.fromstring(xml)  # production: a hardened parser (defusedxml) inside the SAML library
    if a.findtext("saml:Issuer", namespaces=NS) != IDP:
        raise SamlError("wrong issuer")
    cond = a.find("saml:Conditions", NS)
    if cond is None:
        raise SamlError("no conditions")
    not_before, not_on_or_after = cond.get("NotBefore"), cond.get("NotOnOrAfter")  # both optional in SAML
    if (not_before and now < ts(not_before) - SKEW) or (not_on_or_after and now >= ts(not_on_or_after) + SKEW):
        raise SamlError("outside validity window")
    audiences = {e.text for e in cond.findall("saml:AudienceRestriction/saml:Audience", NS)}
    if SP_ENTITY_ID not in audiences:
        raise SamlError("wrong audience")
    data = a.find("saml:Subject/saml:SubjectConfirmation[@Method='urn:oasis:names:tc:SAML:2.0:cm:bearer']/saml:SubjectConfirmationData", NS)
    if data is None or data.get("Recipient") != ACS_URL:
        raise SamlError("wrong recipient")
    if not data.get("NotOnOrAfter") or now >= ts(data.get("NotOnOrAfter")) + SKEW:  # required for bearer assertions
        raise SamlError("subject confirmation expired")
    if data.get("InResponseTo") not in pending:
        raise SamlError("unsolicited or replayed response")
    assertion_id = a.get("ID")
    if assertion_id in seen:
        raise SamlError("assertion replayed")
    pending.discard(data.get("InResponseTo"))
    seen[assertion_id] = ts(data.get("NotOnOrAfter")) + SKEW  # purge entries after this time
    groups = [v.text for v in a.findall("saml:AttributeStatement/saml:Attribute[@Name='groups']/saml:AttributeValue", NS)]
    return {"name_id": a.findtext("saml:Subject/saml:NameID", namespaces=NS), "groups": groups}


def assertion(**over: str) -> str:
    v = {"issuer": IDP, "audience": SP_ENTITY_ID, "recipient": ACS_URL, "irt": "req-1", "id": "a-1", **over}
    return f"""<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="{v['id']}" Version="2.0" IssueInstant="2026-10-15T10:00:00Z">
  <saml:Issuer>{v['issuer']}</saml:Issuer>
  <saml:Subject>
    <saml:NameID>maria@acme.example</saml:NameID>
    <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
      <saml:SubjectConfirmationData Recipient="{v['recipient']}" NotOnOrAfter="2026-10-15T10:05:00Z" InResponseTo="{v['irt']}"/>
    </saml:SubjectConfirmation>
  </saml:Subject>
  <saml:Conditions NotBefore="2026-10-15T09:59:00Z" NotOnOrAfter="2026-10-15T10:05:00Z">
    <saml:AudienceRestriction><saml:Audience>{v['audience']}</saml:Audience></saml:AudienceRestriction>
  </saml:Conditions>
  <saml:AttributeStatement>
    <saml:Attribute Name="groups"><saml:AttributeValue>okta-ops</saml:AttributeValue><saml:AttributeValue>okta-all</saml:AttributeValue></saml:Attribute>
  </saml:AttributeStatement>
</saml:Assertion>"""


now = ts("2026-10-15T10:00:30Z")
pending, seen = {"req-1", "req-2"}, {}
assert check_assertion(assertion(), now, pending, seen) == {"name_id": "maria@acme.example", "groups": ["okta-ops", "okta-all"]}
assert "req-1" not in pending and "a-1" in seen


def error(xml: str, at: datetime = now) -> str:
    try:
        check_assertion(xml, at, pending, seen)
    except SamlError as e:
        return str(e)
    return "accepted"


assert error(assertion(irt="req-2")) == "assertion replayed"  # same assertion ID, valid request
assert error(assertion(id="a-2", irt="req-1")) == "unsolicited or replayed response"  # request already used
assert error(assertion(id="a-3", irt="req-2", audience="https://other-app.example")) == "wrong audience"
assert error(assertion(id="a-4", irt="req-2", recipient="https://evil.example/acs")) == "wrong recipient"
assert error(assertion(id="a-5", irt="req-2", issuer="https://idp.evil.example")) == "wrong issuer"
assert error(assertion(id="a-6", irt="req-2"), ts("2026-10-15T10:07:00Z")) == "outside validity window"
assert error(assertion(id="a-7", irt="req-2")) == "accepted"
```

Complexity: linear in the size of the assertion. The order matters less than completeness, but every check runs on the element whose signature was verified.

#### Follow-ups

- **What is XML signature wrapping?** An attacker moves the signed assertion elsewhere in the document and inserts an unsigned one where your code looks; if signature checking and data reading use different elements, the forgery wins. Read data only from the element the library verified.
- **IdP-initiated SSO?** There is no InResponseTo, so you lose that replay protection; allow it only when the customer needs it, and rely on the assertion ID cache and short validity.
