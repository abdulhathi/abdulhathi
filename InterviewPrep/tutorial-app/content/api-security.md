---
title: REST design, auth and API security
goal: Design a clean REST API and defend every security choice in it (status codes, pagination, versioning, JWT, OAuth2/OIDC/SAML, CORS, CSRF, injection, rate limits) in the terms a healthcare interviewer expects.
minutes: 60
---

A full-stack Python interview will almost always ask you to design or critique an API, and in healthcare the follow-ups go straight to security: who can see this patient's record, how is the token checked, what stops a script from scraping every claim. This chapter covers the design vocabulary (methods, status codes, pagination, versioning, errors) and the security vocabulary (authentication, authorization, OAuth2, OIDC, SAML, JWT, CORS, CSRF, XSS, injection, the OWASP API Top 10), with tested FastAPI and Python examples.

The single most important idea for a healthcare API: **authentication tells you who is calling; authorization must be checked for every object they touch.** Most real breaches are not broken crypto, they are a valid user reading a record that is not theirs.

## REST design essentials

REST models the system as **resources** (nouns) addressed by URLs, manipulated with a small set of HTTP methods, with each request carrying everything needed to process it (stateless).

| Design point | Good default |
|---|---|
| Resource names | Plural nouns: `/patients`, `/patients/{id}/encounters`. No verbs in paths; for real actions use a sub-resource such as `POST /claims/{id}/appeals`. |
| Filtering, sorting | Query parameters: `GET /claims?status=denied&sort=-created_at` |
| Create | `POST /patients` → `201 Created` with a `Location` header and the new body |
| Full replace / partial update | `PUT /patients/{id}` replaces; `PATCH /patients/{id}` changes some fields |
| Long-running work | `202 Accepted` plus a status resource (`/jobs/{id}`) to poll, or a webhook |
| Concurrency | `ETag` on reads, `If-Match` on updates, `412 Precondition Failed` on a stale write |
| Errors | One consistent JSON error format (RFC 9457 problem details) |
| Docs | OpenAPI, which FastAPI generates automatically |

### Methods: safe and idempotent

| Method | Safe (no state change) | Idempotent (repeat = same effect) | Typical use |
|---|---|---|---|
| GET | Yes | Yes | Read |
| HEAD, OPTIONS | Yes | Yes | Metadata, CORS preflight |
| PUT | No | Yes | Replace a resource at a known URL |
| DELETE | No | Yes | Remove (a second delete still leaves it deleted) |
| POST | No | No | Create, or trigger an action |
| PATCH | No | Not guaranteed | Partial update (`{"op": "increment"}` is not idempotent) |

Idempotency matters because networks fail: a client that times out will retry, so retries must not create a second claim or charge a card twice.

### Status codes worth knowing cold

| Code | Meaning | When |
|---|---|---|
| 200 OK | Success with a body | Reads, updates that return the resource |
| 201 Created | Resource created | `POST` that creates; include `Location` |
| 202 Accepted | Queued for async processing | Document uploaded for extraction |
| 204 No Content | Success, no body | `DELETE` |
| 304 Not Modified | Cached copy is still valid | Conditional `GET` with `If-None-Match` |
| 400 Bad Request | Malformed request | Unparseable JSON, bad query syntax |
| 401 Unauthorized | Not authenticated | Missing, expired or invalid token; send `WWW-Authenticate` |
| 403 Forbidden | Authenticated but not allowed | A nurse calling an admin-only endpoint |
| 404 Not Found | No such resource, or you may not know it exists | Also used instead of 403 to avoid leaking that a patient ID exists |
| 409 Conflict | State conflict | Duplicate member ID, version conflict |
| 412 Precondition Failed | `If-Match` ETag did not match | Optimistic concurrency |
| 415 Unsupported Media Type | Wrong `Content-Type` | XML sent to a JSON endpoint |
| 422 Unprocessable Content | Well-formed but invalid | FastAPI's default for Pydantic validation errors |
| 429 Too Many Requests | Rate limited | Include `Retry-After` |
| 500 / 502 / 503 / 504 | Server, bad upstream, unavailable, upstream timeout | Never leak stack traces in the body |

## Authentication and authorization map

| Mechanism | What it is | Where it fits |
|---|---|---|
| Session cookie | Server stores the session; browser sends an opaque ID cookie | Classic server-rendered web apps |
| JWT bearer token | Signed, self-contained token in the `Authorization` header | APIs and SPAs, service-to-service |
| API key | A static secret identifying a client application | Server-to-server, low-risk integrations; never alone for user data |
| OAuth 2.0 | Delegated **authorization** framework: issues access tokens | "Let this app call that API on my behalf" |
| OpenID Connect | Identity layer on OAuth 2.0: adds the ID token (a JWT) and userinfo | Modern SSO, "Sign in with …" |
| SAML 2.0 | XML-based SSO: the IdP posts a signed assertion to the service provider | Enterprise and government SSO |
| mTLS | Both sides present certificates | Service-to-service inside a zero-trust network |

**Your angle:** at Quantiphi you implemented SAML-based authentication with Passport.js and GCS signed URLs for document rendering; at Medidata you used JWT/OAuth2 for API authentication. Those are concrete, credible examples for this whole section.

## Interview questions

### What makes an API RESTful? {core}

REST is an architectural style: resources identified by URLs, a uniform interface using standard HTTP methods and status codes, stateless requests (each carries its own auth and context), representations such as JSON, and cacheable responses. In practice "RESTful" means nouns in URLs, correct methods and status codes, and no server-side session state between calls.

Mention that the strict REST constraint of hypermedia (HATEOAS, links in responses that tell the client what it can do next) is rarely implemented in business APIs, and that's fine to say. What interviewers want is consistency: predictable URLs, correct semantics, good errors, versioning and docs.

### What is the difference between PUT, PATCH and POST? {core}

`POST` creates a resource or triggers an action and is not idempotent: two identical POSTs can create two claims. `PUT` replaces the whole resource at a known URL and is idempotent: sending it twice leaves the same state. `PATCH` changes only the fields you send; it is idempotent if you send values ("set status to closed") but not if you send operations ("increment retries").

A good follow-up answer: with `PUT`, omitted fields are reset or rejected, so for big resources like a patient profile, `PATCH` with a validated partial model is friendlier. In FastAPI that is a Pydantic model where every field is optional, applied with `model_dump(exclude_unset=True)`.

### 401 vs 403? 400 vs 422? {core}

401 means "I do not know who you are": the token is missing, expired or invalid, and the response should include a `WWW-Authenticate` header. 403 means "I know who you are and you may not do this". For a resource the caller should not even know exists, such as another patient's record, many APIs return 404 instead of 403 so they do not confirm the ID is valid.

In HTTP terms, 400 is a generic "bad request" (malformed syntax, a missing required header), and 422 means the request was understood but its content is invalid, such as a date of birth in the future. FastAPI returns 422 for every request-validation failure it detects, including malformed JSON (`json_invalid`) and a non-integer in an `int` query parameter; you raise 400 yourself for other bad requests.

### How do you design pagination?

For small or admin datasets, offset pagination (`?limit=50&offset=100`) is simple and lets users jump to a page. For large or fast-changing data, cursor (keyset) pagination is better: the response returns an opaque `next_cursor` that encodes the last item's sort key, and the next query asks for items after it. Each page costs the same (it uses an index instead of skipping rows) and items do not shift or repeat when new rows arrive.

Return the items plus pagination metadata (`next_cursor` or a `Link` header), cap `limit` on the server, and always sort by a unique key (for example created time plus ID) so the order is deterministic. See the cursor pagination problem below and the keyset query in the SQL chapter.

### How do you version an API?

The most common choice is a version in the URL path (`/v1/claims`): obvious, easy to route at the gateway and easy to see in logs. Alternatives are a header (`Accept: application/vnd.example.v2+json` or a custom header) or a query parameter. Whatever you choose, avoid breaking changes inside a version: adding optional fields is fine; removing or renaming fields, changing types or tightening validation needs a new version.

Senior detail: publish a deprecation policy, announce sunset dates (the `Deprecation` and `Sunset` response headers exist for this), run old and new versions side by side, and track which clients still call the old one before you remove it.

### How should an API report errors? {deep}

With one consistent, machine-readable format and the right status code. RFC 9457 "Problem Details for HTTP APIs" (which replaced RFC 7807) defines it: media type `application/problem+json` with `type`, `title`, `status`, `detail` and `instance`, plus your own extension fields such as a list of field errors or a trace ID. Never return stack traces, SQL or PHI in an error body.

```python
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

app = FastAPI()


@app.exception_handler(HTTPException)
async def problem_details(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": {404: "Not Found", 409: "Conflict"}.get(exc.status_code, "Error"),
            "status": exc.status_code,
            "detail": exc.detail,
            "instance": request.url.path,
        },
    )


@app.get("/claims/{claim_id}")
def get_claim(claim_id: int) -> dict:
    raise HTTPException(status_code=404, detail=f"Claim {claim_id} was not found.")


response = TestClient(app).get("/claims/42")
assert response.status_code == 404
assert response.headers["content-type"] == "application/problem+json"
assert response.json() == {
    "type": "about:blank",
    "title": "Not Found",
    "status": 404,
    "detail": "Claim 42 was not found.",
    "instance": "/claims/42",
}
```

### Sessions vs JWT: which would you choose? {core}

Server-side sessions store state on the server and give the browser an opaque session ID cookie; they are easy to revoke (delete the session) and the cookie can be `HttpOnly`, `Secure` and `SameSite`. JWTs are self-contained signed tokens that any service can verify without a database lookup, which suits APIs, mobile clients and microservices, but they are hard to revoke before they expire.

My default: for a browser app on one domain, a secure session cookie (or a backend-for-frontend that keeps tokens server-side); for APIs and service-to-service calls, short-lived JWT access tokens (minutes) issued by an identity provider, plus refresh tokens with rotation. The trade-off to name is statelessness versus revocation.

### What is inside a JWT and how do you validate one? {core}

A JWT is three base64url-encoded parts separated by dots: a header (algorithm, token type, key ID `kid`), a payload of claims (`sub`, `iss`, `aud`, `exp`, `iat`, plus custom claims such as roles or scopes), and a signature over the first two parts. It is signed, not encrypted: anyone can read the payload, so never put PHI or secrets in it.

To validate: check the signature with the expected algorithm only (never trust the header's `alg` blindly), using the issuer's public key fetched from its JWKS endpoint by `kid`; then check `exp` (and `nbf`), `iss` equals your identity provider, and `aud` equals your API. Only then read the roles or scopes for authorization. In Python use a maintained library (PyJWT or Authlib), not hand-written crypto; the problem at the end of this chapter builds HS256 by hand only to show the mechanics.

```python
import base64
import json

# A token's payload is just base64url-encoded JSON: readable by anyone who holds the token.
token = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJzdWIiOiJ1c2VyLTQyIiwicm9sZSI6Im51cnNlIn0"
    ".signature-not-checked-here"
)
header_b64, payload_b64, _ = token.split(".")
pad = lambda s: s + "=" * (-len(s) % 4)
assert json.loads(base64.urlsafe_b64decode(pad(header_b64))) == {"alg": "HS256", "typ": "JWT"}
assert json.loads(base64.urlsafe_b64decode(pad(payload_b64))) == {"sub": "user-42", "role": "nurse"}
```

### What are the common JWT mistakes? Where should a browser keep the token?

The classic mistakes: accepting `alg: none`; algorithm confusion (a server expecting RS256 accepts an HS256 token signed with the public key as the HMAC secret); not checking `exp`, `iss` or `aud`; long-lived tokens with no revocation; secrets or PHI in the payload; weak HMAC secrets; and not rotating keys (use `kid` and JWKS).

On storage: `localStorage` is readable by any JavaScript on the page, so one XSS bug steals the token. An `HttpOnly; Secure; SameSite` cookie cannot be read by JavaScript but is sent automatically, so you must handle CSRF. A strong pattern is the backend-for-frontend: the browser holds only an `HttpOnly` session cookie, and the BFF keeps the OAuth tokens server-side. For SPAs that must hold tokens, keep the access token in memory, make it short-lived, and use refresh-token rotation.

### Explain OAuth 2.0 and the authorization code flow with PKCE.

OAuth 2.0 is a delegated authorization framework: a client application gets an access token to call an API on a user's behalf without ever seeing the user's password. In the authorization code flow, the app redirects the user to the authorization server, the user logs in and consents, the server redirects back with a short-lived code, and the app exchanges that code at the token endpoint for an access token (and usually a refresh token).

PKCE (Proof Key for Code Exchange) protects that code: the app creates a random `code_verifier`, sends its SHA-256 hash (`code_challenge`) in the first redirect, and must present the original verifier when it redeems the code, so an intercepted code is useless. Current best practice (the OAuth 2.0 Security Best Current Practice, RFC 9700, January 2025, and the OAuth 2.1 draft) uses authorization code with PKCE for every client type, including SPAs and mobile apps; the implicit and resource owner password grants should no longer be used. For machine-to-machine calls with no user, use the client credentials grant.

```python
import base64
import hashlib


def code_challenge(verifier: str) -> str:
    """PKCE S256: BASE64URL(SHA256(verifier)) with the padding removed."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


# The worked example from RFC 7636, Appendix B.
assert code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
```

### OAuth 2.0 vs OpenID Connect vs SAML? {core}

OAuth 2.0 is about authorization: it issues access tokens that let a client call an API, and says nothing standard about who the user is. OpenID Connect adds authentication on top of OAuth 2.0: an ID token (a JWT describing the user), a userinfo endpoint and discovery metadata, which is why modern SSO uses OIDC. SAML 2.0 is an older XML-based SSO standard: the identity provider sends a signed XML assertion to the service provider, usually through the browser with an HTTP POST; it is still everywhere in enterprise and government.

**Your angle:** the LDH Medicaid Document AI platform used SAML through Passport.js. Be ready to explain the SP-initiated flow (redirect to the IdP, signed assertion posted back to the assertion consumer service, session created) and what a service provider must validate on the assertion: the signature, audience, recipient and time window (the SAML library does these checks when configured correctly).

### Authentication vs authorization, and RBAC vs ABAC? {core}

Authentication proves identity (login, token validation). Authorization decides what that identity may do, and it must be enforced on the server for every request, not hidden in the UI.

RBAC grants permissions through roles (nurse, billing specialist, admin): simple and auditable. ABAC decides from attributes of the user, the resource and the context (the user's facility, whether they are on this patient's care team, the time, the purpose), which is what healthcare usually needs beyond roles. Real systems combine both: a role gates the endpoint, and an attribute check gates the specific record. Add "break the glass" emergency access with mandatory reason and audit.

### What is broken object level authorization, and how do you prevent it?

BOLA (number 1 on the OWASP API Security Top 10) is when an API checks that the caller is logged in but not that they may access the specific object ID in the request, so changing `/patients/101` to `/patients/102` returns someone else's record. Prevent it by checking ownership or relationship on every object access, ideally by scoping the query itself (`WHERE id = :id AND care_team_id = :user_team`), using non-guessable IDs as defence in depth only, and testing it explicitly.

```python
from dataclasses import dataclass

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.testclient import TestClient


@dataclass
class User:
    id: str
    role: str
    team: str


# Stand-ins for a token validator and a database.
TOKENS = {"t-nurse-a": User("u1", "nurse", "team-a"), "t-admin": User("u9", "admin", "ops")}
PATIENTS = {101: {"id": 101, "name": "Maria Garcia", "team": "team-a"}, 102: {"id": 102, "name": "Li Wei", "team": "team-b"}}

app = FastAPI()


def current_user(authorization: str | None = Header(default=None)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    user = TOKENS.get(authorization.removeprefix("Bearer "))
    if user is None:
        raise HTTPException(401, "Invalid token", headers={"WWW-Authenticate": "Bearer"})
    return user


def require_role(*roles: str):
    def check(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "Forbidden")
        return user
    return check


@app.get("/patients/{patient_id}")
def read_patient(patient_id: int, user: User = Depends(require_role("nurse", "doctor"))) -> dict:
    patient = PATIENTS.get(patient_id)
    # Object-level check: same 404 whether the patient is missing or belongs to another team.
    if patient is None or patient["team"] != user.team:
        raise HTTPException(404, "Patient not found")
    return patient


client = TestClient(app)
nurse = {"Authorization": "Bearer t-nurse-a"}
assert client.get("/patients/101").status_code == 401                       # no token
assert client.get("/patients/101", headers={"Authorization": "Bearer nope"}).status_code == 401
assert client.get("/patients/101", headers={"Authorization": "Bearer t-admin"}).status_code == 403  # wrong role
assert client.get("/patients/101", headers=nurse).json()["name"] == "Maria Garcia"
assert client.get("/patients/102", headers=nurse).status_code == 404        # another team's patient: BOLA blocked
```

### Name the OWASP API Security Top 10. {deep}

The 2023 list: API1 Broken Object Level Authorization, API2 Broken Authentication, API3 Broken Object Property Level Authorization (exposing or letting clients set fields they should not, such as `role` or `ssn`), API4 Unrestricted Resource Consumption (no rate limits or size limits), API5 Broken Function Level Authorization (a regular user calling admin endpoints), API6 Unrestricted Access to Sensitive Business Flows (automated abuse of a legitimate flow), API7 Server-Side Request Forgery, API8 Security Misconfiguration, API9 Improper Inventory Management (forgotten old versions and debug endpoints), API10 Unsafe Consumption of APIs (trusting third-party API data blindly).

For API3 in FastAPI, separate input and output models: a `PatientCreate` that cannot set `role` or `id`, and a `PatientOut` that never includes internal fields, enforced with `response_model`.

### What is CORS, and does it protect your API? {core}

CORS (Cross-Origin Resource Sharing) is a browser mechanism: by default a page on one origin cannot read responses from another origin, and the server opts in with `Access-Control-Allow-Origin` and related headers. For non-simple requests (custom headers like `Authorization`, methods like `PUT`, JSON bodies) the browser first sends an `OPTIONS` preflight. You cannot combine `Access-Control-Allow-Origin: *` with credentials, so list exact origins.

It does not protect the server: curl, Postman and server-side scripts ignore CORS entirely. It only controls which web pages may read responses in a browser. Authentication and authorization are still required.

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://portal.example.com"],  # exact origins, never "*" with credentials
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=True,
)


@app.get("/patients")
def patients() -> list[dict]:
    return []


client = TestClient(app)
preflight = {"Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "Authorization"}
ok = client.options("/patients", headers={"Origin": "https://portal.example.com", **preflight})
assert ok.status_code == 200
assert ok.headers["access-control-allow-origin"] == "https://portal.example.com"

blocked = client.options("/patients", headers={"Origin": "https://evil.example", **preflight})
assert blocked.status_code == 400 and "access-control-allow-origin" not in blocked.headers

# The server still answers a direct request; only a browser would refuse to hand it to the page.
direct = client.get("/patients", headers={"Origin": "https://evil.example"})
assert direct.status_code == 200 and "access-control-allow-origin" not in direct.headers
```

### What are CSRF and XSS, and how do you prevent them?

CSRF (cross-site request forgery) tricks a logged-in user's browser into sending a request to your site, riding on cookies the browser attaches automatically. Prevent it with `SameSite=Lax` or `Strict` cookies, anti-CSRF tokens for cookie-authenticated state changes, checking the `Origin` header, and never changing state on `GET`. APIs that use `Authorization: Bearer` headers are not exposed to classic CSRF, because browsers do not add that header on their own.

XSS (cross-site scripting) injects script into your page, which then runs with the user's privileges and can read tokens in `localStorage`. Prevent it by escaping output (React escapes by default; avoid `dangerouslySetInnerHTML` or sanitise with DOMPurify), validating input, setting a Content-Security-Policy, and keeping session tokens in `HttpOnly` cookies.

### How do you prevent SQL injection? {core}

Never build SQL by concatenating or formatting user input; always use parameterised queries (bound parameters), which send the SQL and the values separately so input can never become SQL syntax. ORMs like SQLAlchemy parameterise for you, and with raw SQL you use `text()` with named parameters. Add least-privilege database accounts and input validation as extra layers; escaping by hand is not a defence.

```python
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript("""
    CREATE TABLE patients (id INTEGER PRIMARY KEY, last_name TEXT, ssn TEXT);
    INSERT INTO patients VALUES (1, 'Garcia', '111-11-1111'), (2, 'Lee', '222-22-2222');
""")

attack = "x' OR '1'='1"

# Vulnerable: the input becomes part of the SQL text, and the OR clause matches every row.
unsafe = db.execute(f"SELECT id FROM patients WHERE last_name = '{attack}'").fetchall()
assert unsafe == [(1,), (2,)]

# Safe: the value is bound as data, so it is compared as a literal string and matches nothing.
safe = db.execute("SELECT id FROM patients WHERE last_name = ?", (attack,)).fetchall()
assert safe == []
```

### How should passwords be stored? {deep}

Never store passwords or reversible encryptions of them. Store a slow, salted, memory-hard hash: Argon2id is the current recommendation, with scrypt, bcrypt or PBKDF2 as acceptable choices. Each password gets its own random salt, verification recomputes the hash and compares in constant time, and the parameters are stored with the hash so you can raise them later. Better still, do not handle passwords at all: delegate login to an identity provider (Entra ID, Okta, Cognito, Auth0) with OIDC or SAML.

```python
import hashlib
import hmac
import os


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    # n=2**14 keeps this demo fast; OWASP's current guidance is n=2**17 (raise maxmem to allow it).
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt$16384$8$1${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    _, n, r, p, salt_hex, digest_hex = stored.split("$")
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=int(n), r=int(r), p=int(p))
    return hmac.compare_digest(digest.hex(), digest_hex)  # constant-time comparison


stored = hash_password("correct horse battery staple")
assert verify_password("correct horse battery staple", stored)
assert not verify_password("Correct horse battery staple", stored)
assert hash_password("same") != hash_password("same")  # a fresh salt every time
```

### How would you rate limit an API? {deep}

Limit by a stable identity (API key, user ID, client ID, or IP as a fallback) and return `429 Too Many Requests` with a `Retry-After` header. Common algorithms: fixed window (simple, bursty at window edges), sliding window (smoother), and token bucket (allows short bursts up to a capacity while enforcing an average rate). With several API instances, keep counters in a shared store such as Redis, or enforce limits at the gateway (Azure API Management, Apigee, Kong, AWS API Gateway, Cloud Armor).

Also limit payload sizes, page sizes, upload sizes and query complexity, because OWASP's "unrestricted resource consumption" is about more than request counts. A token bucket implementation is in the practical coding chapter.

### How do you handle secrets and transport security? {deep}

Secrets live in a secret manager (Azure Key Vault, AWS Secrets Manager, GCP Secret Manager) or are injected as environment variables at deploy time, never in Git, images or logs; prefer workload identity or managed identities over long-lived keys, and rotate. All traffic uses TLS 1.2 or higher with HSTS on public sites; internal service-to-service traffic uses TLS too (often mTLS in a service mesh). Signed, short-lived URLs (like GCS signed URLs) give temporary access to a single file without exposing bucket credentials.

### When is an API key acceptable? {deep}

An API key identifies a calling application, not a user, so it is acceptable for server-to-server integrations, partner access with low-risk data, or metering, sent in a header (never in the URL, where it ends up in logs) over TLS, scoped, rate-limited and rotatable. It is not enough on its own for user-level access to PHI: it cannot express "which patient may this person see". For that, use OAuth 2.0 tokens tied to a user or a client with scopes.

### FastAPI vs Django vs Flask? {core}

FastAPI is async-first (ASGI), validates requests and responses with Pydantic type hints, generates OpenAPI docs automatically and has a clean dependency-injection system, which makes it ideal for APIs and ML-serving services. Django is batteries-included: ORM, migrations, admin, auth, forms, with Django REST Framework for APIs; best for large data-driven apps that want everything integrated. Flask is a minimal micro-framework: you choose the extensions, which gives flexibility but more assembly.

| | FastAPI | Django (+ DRF) | Flask |
|---|---|---|---|
| Style | API-first, async | Full-stack, batteries included | Micro-framework |
| Validation | Pydantic, from type hints | DRF serializers, forms | Extensions (Marshmallow, Pydantic) |
| Docs | OpenAPI + Swagger UI built in | Via packages (drf-spectacular) | Via extensions |
| ORM | Bring your own (SQLAlchemy, SQLModel) | Django ORM built in | Bring your own |
| Async | Native | Supported (async views, partly async ORM) | Async views possible, but WSGI-based |
| Best fit | Microservices, ML serving, high-concurrency I/O | Admin-heavy business apps | Small services, full control |

**Your angle:** you built FastAPI and Pydantic services for the Document AI platform; say why FastAPI fit (typed contracts for extracted data, async I/O to cloud storage and external APIs, automatic docs for the front-end team).

### REST vs GraphQL vs gRPC?

REST uses resource URLs and HTTP semantics: simple, cacheable, universally understood, and the right default for public and partner APIs. GraphQL exposes one endpoint where clients ask for exactly the fields they need, which removes over-fetching for complex UIs, at the cost of harder caching, query-cost limits and field-level authorization. gRPC uses Protocol Buffers over HTTP/2 with generated clients: fast, strongly typed and streaming-capable, ideal for internal service-to-service calls, but not browser-native.

A practical answer: REST for external and front-end APIs, gRPC (or messaging) between internal services where latency matters, GraphQL when many different UIs need flexible views over the same data.

### How do you secure a healthcare API end to end? {core}

Start with identity: an OIDC or SAML identity provider, short-lived tokens, MFA for staff. Enforce authorization on every request at two levels, role for the endpoint and relationship for the record (care team, plan, tenant), with the minimum-necessary principle in what fields you return. Encrypt in transit (TLS everywhere) and at rest (managed keys, database and storage encryption).

Then the operational layer: validate all input with Pydantic, parameterise every query, rate limit, keep PHI out of logs, URLs and error messages, write an immutable audit log of who accessed which record and when, keep secrets in a vault, and patch dependencies. Test it: authorization tests for every endpoint (including another user's IDs), dependency scanning and periodic penetration tests. Under HIPAA, the cloud provider and any vendor handling PHI also needs a BAA.

## Coding problems

### Sign and verify an HS256 JWT with only the standard library {medium}

Write `sign(payload, secret)` that produces a compact JWT using HS256, and `verify(token, secret, now)` that returns the payload if the signature is valid and the token has not expired, and raises `ValueError` otherwise. (In production you would use PyJWT or Authlib; this shows you understand the format.)

```text
token = sign({"sub": "user-42", "exp": 2000}, "s3cret")
verify(token, "s3cret", now=1000)  → {"sub": "user-42", "exp": 2000}
verify(token, "s3cret", now=3000)  → ValueError("expired")
verify(token, "wrong",  now=1000)  → ValueError("bad signature")
```

#### Hints

1. A JWT is `base64url(header).base64url(payload).base64url(signature)`, and base64url drops the `=` padding.
2. The signature is HMAC-SHA256 over the ASCII bytes of `header.payload`.
3. Compare signatures with `hmac.compare_digest`, check the header's `alg` is exactly HS256, then check `exp`.

#### Solution

Encode the header and payload as compact JSON, base64url them without padding, and sign the joined string with HMAC-SHA256. Verification recomputes the signature and compares in constant time before trusting anything in the payload, rejects any algorithm other than the one we expect, and then checks expiry.

```python
import base64
import hashlib
import hmac
import json


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign(payload: dict, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = ".".join(
        b64url_encode(json.dumps(part, separators=(",", ":")).encode()) for part in (header, payload)
    )
    signature = hmac.new(secret.encode(), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{b64url_encode(signature)}"


def verify(token: str, secret: str, now: float) -> dict:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
    except ValueError:
        raise ValueError("malformed token") from None
    header = json.loads(b64url_decode(header_b64))
    if header.get("alg") != "HS256":  # never let the token choose the algorithm
        raise ValueError("unexpected algorithm")
    expected = hmac.new(secret.encode(), f"{header_b64}.{payload_b64}".encode("ascii"), hashlib.sha256).digest()
    if not hmac.compare_digest(expected, b64url_decode(signature_b64)):
        raise ValueError("bad signature")
    payload = json.loads(b64url_decode(payload_b64))
    if "exp" in payload and now >= payload["exp"]:
        raise ValueError("expired")
    return payload


token = sign({"sub": "user-42", "exp": 2000}, "s3cret")
assert token.count(".") == 2 and "=" not in token
assert verify(token, "s3cret", now=1000) == {"sub": "user-42", "exp": 2000}

for bad_secret, now, message in [("s3cret", 3000, "expired"), ("wrong", 1000, "bad signature")]:
    try:
        verify(token, bad_secret, now=now)
        raise AssertionError("should have failed")
    except ValueError as error:
        assert str(error) == message

# Tampering with the payload breaks the signature.
header_b64, _, signature_b64 = token.split(".")
forged = f"{header_b64}.{b64url_encode(json.dumps({'sub': 'admin', 'exp': 2000}).encode())}.{signature_b64}"
try:
    verify(forged, "s3cret", now=1000)
    raise AssertionError("forgery accepted")
except ValueError as error:
    assert str(error) == "bad signature"

# An unsigned token claiming alg "none" is rejected before anything else.
none_header = b64url_encode(json.dumps({"alg": "none"}).encode())
try:
    verify(f"{none_header}.{token.split('.')[1]}.", "s3cret", now=1000)
    raise AssertionError("alg none accepted")
except ValueError as error:
    assert str(error) == "unexpected algorithm"
```

Complexity: O(n) in the token length. The security properties come from the constant-time comparison, the fixed algorithm and checking the signature before using any claim.

#### Follow-ups

- **Why do most identity providers use RS256 or ES256 instead?** Asymmetric keys: only the issuer holds the private key, and every API verifies with the public key from the JWKS endpoint, so no shared secret is spread across services.
- **What else would you check?** `iss`, `aud`, `nbf`, a small clock-skew leeway, and the `kid` to pick the right key during rotation.

### Cursor pagination over a sorted dataset {medium}

Given claims sorted by `(created_at, id)`, write `page(items, limit, cursor=None)` that returns `(items_on_page, next_cursor)`. The cursor must be opaque to clients (not a raw offset), and `next_cursor` is `None` on the last page. Paging must stay correct when a new claim is inserted between requests.

#### Hints

1. The cursor should encode the sort key of the last item returned, not a position.
2. The next page is "items whose `(created_at, id)` is greater than the cursor's", and tuples compare element by element in Python.
3. Make it opaque with base64url-encoded JSON. A real API would also sign it (HMAC) so clients cannot forge one.

#### Solution

Encode the last item's `(created_at, id)` as the cursor. On the next call, decode it and take the items whose key is strictly greater, which is exactly what a keyset SQL query (`WHERE (created_at, id) > (?, ?) ORDER BY created_at, id LIMIT ?`) does with an index. Fetching `limit + 1` items tells us whether another page exists without a count query.

```python
import base64
import bisect
import json


def encode_cursor(key: tuple[str, int]) -> str:
    return base64.urlsafe_b64encode(json.dumps(key).encode()).decode()


def decode_cursor(cursor: str) -> tuple[str, int]:
    created_at, item_id = json.loads(base64.urlsafe_b64decode(cursor.encode()))
    return created_at, item_id


def page(items: list[dict], limit: int, cursor: str | None = None) -> tuple[list[dict], str | None]:
    keys = [(item["created_at"], item["id"]) for item in items]  # items are sorted by this key
    start = 0 if cursor is None else bisect.bisect_right(keys, decode_cursor(cursor))
    window = items[start : start + limit + 1]  # one extra row reveals whether a next page exists
    has_more = len(window) > limit
    window = window[:limit]
    next_cursor = encode_cursor((window[-1]["created_at"], window[-1]["id"])) if has_more else None
    return window, next_cursor


claims = [{"id": i, "created_at": f"2026-01-{d:02d}"} for i, d in [(1, 1), (2, 1), (3, 2), (4, 3), (5, 3)]]

first, cursor = page(claims, limit=2)
assert [c["id"] for c in first] == [1, 2] and cursor is not None

# A claim arrives that sorts before the cursor; offset paging would now repeat claim 2.
claims.insert(0, {"id": 0, "created_at": "2025-12-31"})

second, cursor = page(claims, limit=2, cursor=cursor)
assert [c["id"] for c in second] == [3, 4]
third, cursor = page(claims, limit=2, cursor=cursor)
assert [c["id"] for c in third] == [5] and cursor is None
assert page([], limit=2) == ([], None)
```

Complexity: O(log n + limit) per page here with `bisect`; in the database it is an index range scan, constant cost per page regardless of depth.

#### Follow-ups

- **Why not just return the offset?** Deep offsets are slow in SQL, and inserts or deletes between requests shift rows, causing duplicates or gaps.
- **How do you support "previous page"?** Return a `prev_cursor` and query `<` the first item's key in reverse order, then reverse the results.

### Idempotency keys for a create-claim endpoint {medium}

`POST /claims` is retried by clients after timeouts, which creates duplicate claims. Make it idempotent: the client sends an `Idempotency-Key` header; the first request creates the claim, and a retry with the same key and the same body returns the original response without creating another claim. Reusing the key with a different body must return `409 Conflict`.

#### Hints

1. Store the response for each idempotency key, together with a fingerprint (hash) of the request body.
2. On a repeat key: same fingerprint → replay the stored response; different fingerprint → 409.
3. In production the store is a database table or Redis with a TTL, and the "check, then create" must be atomic (a unique constraint on the key).

#### Solution

Keep a map from idempotency key to `(body fingerprint, status, response)`. The handler looks up the key first; only a new key creates a claim. Hashing a canonical JSON form of the body detects key reuse with a different payload.

```python
import hashlib
import itertools
import json

from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.testclient import TestClient
from pydantic import BaseModel


class ClaimIn(BaseModel):
    member_id: str
    amount: int


app = FastAPI()
CLAIMS: dict[int, dict] = {}
IDEMPOTENCY: dict[str, tuple[str, dict]] = {}  # key -> (body fingerprint, stored response)
next_id = itertools.count(1)


@app.post("/claims", status_code=201)
def create_claim(claim: ClaimIn, response: Response, idempotency_key: str = Header()) -> dict:
    fingerprint = hashlib.sha256(json.dumps(claim.model_dump(), sort_keys=True).encode()).hexdigest()
    if idempotency_key in IDEMPOTENCY:
        stored_fingerprint, stored = IDEMPOTENCY[idempotency_key]
        if stored_fingerprint != fingerprint:
            raise HTTPException(409, "Idempotency-Key was already used with a different request body.")
        response.headers["Idempotent-Replayed"] = "true"
        return stored
    claim_id = next(next_id)
    CLAIMS[claim_id] = {"id": claim_id, **claim.model_dump()}
    IDEMPOTENCY[idempotency_key] = (fingerprint, CLAIMS[claim_id])
    return CLAIMS[claim_id]


client = TestClient(app)
body = {"member_id": "M-1", "amount": 180}

first = client.post("/claims", json=body, headers={"Idempotency-Key": "k-1"})
retry = client.post("/claims", json=body, headers={"Idempotency-Key": "k-1"})
assert first.status_code == 201 and retry.status_code == 201
assert first.json() == retry.json() == {"id": 1, "member_id": "M-1", "amount": 180}
assert retry.headers["Idempotent-Replayed"] == "true"
assert len(CLAIMS) == 1  # the retry did not create a second claim

conflict = client.post("/claims", json={**body, "amount": 999}, headers={"Idempotency-Key": "k-1"})
assert conflict.status_code == 409

missing = client.post("/claims", json=body)
assert missing.status_code == 422  # the header is required
assert client.post("/claims", json=body, headers={"Idempotency-Key": "k-2"}).json()["id"] == 2
```

Complexity: O(size of body) per request for the hash, O(1) lookups.

#### Follow-ups

- **Two identical requests arrive at the same instant on two servers.** Insert the key into a table with a unique constraint (status "in progress") before doing the work; the loser gets a conflict and either waits or returns 409 "request in progress".
- **Is 409 the right code for a reused key with a different body?** It is a common choice; the IETF Idempotency-Key draft suggests 422 for that case and 409 for a retry that arrives while the original is still in progress. Pick one and document it.
- **How long do you keep keys?** A TTL long enough to cover client retry windows (often 24 hours), then purge.
- **Is this needed for PUT or DELETE?** Those are idempotent by definition, but a key still helps when the operation has side effects such as sending a notification.
