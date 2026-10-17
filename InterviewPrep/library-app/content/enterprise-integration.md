---
title: Enterprise integration, ERPs, SAP APIs and webhooks
goal: Explain how agents and web apps safely read from and write to enterprise systems such as SAP, and design integrations that survive rate limits, timeouts, retries and audits.
minutes: 45
---

Enterprise and agent-platform roles often list integrating web applications with enterprise systems (ERPs, SAP APIs) as a plus, and their orchestration services coordinate agent workflows with external enterprise APIs. In practice that means agents that look up purchase orders, create tickets, or raise orders in an ERP, with a human approving the risky steps. The interview will test whether you know the integration basics (styles, idempotency, retries, mapping, auth) and whether you can talk sensibly about SAP even if you have not used it.

Be honest: SAP is not on your resume. Your integration record is strong, though: the FedEx SOAP-to-REST modernisation across about 24 OrderingStore applications plus more than 10 others, the multi-carrier Labels Web application (FedEx, USPS, UPS, Endicia) you enhanced, your analysis of Labcorp fulfilment workflows with API-based order processing, the Availity multi-payer appeals integration with Molina at Cognizant, and the integration with external APIs for final data submission on the Document AI platform. The bridge is: "I have not used SAP itself, but I have integrated many enterprise APIs where a wrong write is expensive, and I know how SAP exposes its APIs."

## Integration styles

| Style | How it works | Use it when | Watch out for |
|---|---|---|---|
| Synchronous API (REST, OData, SOAP, gRPC) | Call and wait for the answer | A user or agent needs the answer now; small reads and writes | Timeouts, rate limits, the caller is down when the ERP is down |
| Asynchronous messaging (Pub/Sub, queues) | Put a message on a queue; a worker calls the system | Writes that can wait seconds; smoothing load; retries | Duplicates (at-least-once), ordering, poison messages |
| Events and webhooks | The system tells you when something changed | Reacting to changes (PO approved, invoice posted) | Lost or repeated deliveries, signature checks, replay |
| Change data capture (CDC) | Stream database changes (Debezium, Datastream) | Keeping a read model or analytics copy in sync | Schema coupling to the source database, often not allowed for an ERP |
| Batch and files | Scheduled exports and imports (CSV, IDocs, SFTP) | Large volumes, nightly reconciliation, legacy partners | Latency, partial failures, file-level reprocessing |

The classic reference for the vocabulary is Hohpe and Woolf's *Enterprise Integration Patterns*: message channel, translator, content-based router, aggregator, idempotent receiver, dead letter channel, claim check.

## SAP for a non-SAP engineer

| Term | What it is |
|---|---|
| S/4HANA, ECC | SAP's ERP. S/4HANA is the current generation (cloud or on-premises); ECC is the older one many companies still run |
| OData v2 / v4 | REST-style protocol SAP uses for most modern APIs; v2 is still the most common in S/4HANA, newer APIs use v4 |
| BAPI | Business Application Programming Interface: a stable, released function for a business operation, such as `BAPI_PO_CREATE1` to create a purchase order |
| RFC | Remote Function Call: SAP's protocol for calling function modules (including BAPIs) from outside, through connectors such as JCo |
| IDoc | Intermediate Document: SAP's asynchronous message format for EDI-style exchange (for example the `ORDERS` message type for purchase orders) |
| SAP BTP | Business Technology Platform: SAP's cloud platform for extensions and integration |
| Integration Suite | BTP's integration service: Cloud Integration (iFlows), API Management, Event Mesh and prebuilt adapters |
| Cloud Connector | Agent installed on-premises that opens an outbound tunnel to BTP, so cloud apps can reach on-premises SAP without opening inbound firewall ports |
| SAP Business Accelerator Hub | SAP's catalogue of published APIs at api.sap.com (called SAP API Business Hub until 2023) |
| Clean core | SAP's guidance to keep the ERP unmodified and integrate through released APIs and extensions on BTP |

On Google Cloud, **Application Integration** with **Integration Connectors** includes an SAP ERP connector that reaches BAPIs, RFCs, tables and IDocs through SAP's JCo library, and **Apigee** can front enterprise APIs with security and quotas.

## Letting an agent write to an ERP safely

1. **Validate** the agent's proposed action against a strict schema and business rules (supplier exists, amount within limits, currency valid).
2. **Map** it through an anti-corruption layer into the ERP's format; never let the model produce ERP payloads directly.
3. **Preview** the effect: a dry run or simulation where the API offers one, or a human-readable summary.
4. **Approve:** a human approves above a threshold (amount, supplier, type), with separation of duties.
5. **Write once:** use a business reference derived from the run and step, check for an existing document before creating, and treat timeouts as "unknown", not "failed".
6. **Retry carefully:** only transient errors, with backoff and a circuit breaker, through a rate-limited queue.
7. **Record** an audit trail: run, user, approver, request, ERP document number and the result.

## Interview questions

### How do you choose between synchronous calls, messaging, events and batch for an integration? {core}

Start from the business need: does someone wait for the answer, how fresh must the data be, how large are the volumes, and what happens if the other system is down? A user or agent asking "what is the status of PO 4500000123?" needs a synchronous read with a short timeout and a cache. Creating an order that a human has approved can go through a queue, so retries and rate limits are handled by a worker and the UI shows progress. Reacting to changes in the ERP (an invoice was posted) fits events or webhooks, and nightly reconciliation or large data loads fit batch.

Most real integrations mix them: async writes, sync reads with caching, events for changes, and a batch reconciliation job as the safety net that catches anything the others missed.

### You have not used SAP. How would you get productive quickly? {core}

Honestly and fast: "I have not worked with SAP directly, but I have worked on many enterprise integrations where wrong writes are expensive, such as the FedEx SOAP-to-REST modernisation across about 24 OrderingStore applications plus more than 10 others, the multi-carrier labelling application, and external submission APIs on a Document AI platform. With SAP I would start from the released APIs in the Business Accelerator Hub for the objects we need, read the service's `$metadata`, work against a sandbox with the SAP team, and agree early on the business keys, error codes and approval rules." Then show you know the vocabulary: OData services, BAPIs, IDocs, BTP and the Cloud Connector, and the clean-core principle.

The point to land is that the hard parts of an ERP integration are not SAP-specific: idempotency, mapping, error handling, authorisation and auditing. Those you have done.

### What is OData, and what changed between v2 and v4? {core}

OData is an OASIS standard for REST-style data APIs: entity sets as URLs (`/A_PurchaseOrder('4500000123')`), standard query options (`$filter`, `$select`, `$expand`, `$orderby`, `$top`, `$skip`), a machine-readable `$metadata` document describing the entities, and conventions for create, update (`PATCH` with `If-Match`), delete and batching. SAP Gateway exposes most S/4HANA APIs this way.

The differences you will meet: v2 wraps JSON responses in `{"d": {"results": [...]}}`, returns dates as `/Date(1791936000000)/`, counts with `$inlinecount=allpages` and pages with `__next`; v4 returns `{"value": [...]}` with ISO dates, counts with `$count=true`, pages with `@odata.nextLink`, and has richer types and a JSON batch format. Filter literals differ too: v2 writes `datetime'2026-10-01T00:00:00'`, v4 writes the date unquoted.

### How do you write to an SAP OData service? {deep}

SAP Gateway protects modifying requests with a CSRF token. First send a `GET` (often to the service root) with the header `X-CSRF-Token: Fetch`; the response carries the token in `x-csrf-token` and sets session cookies. Then send the `POST`, `PATCH` or `DELETE` with that token and the same cookies. If the server answers `403` with `x-csrf-token: Required`, the token or session expired: fetch a new one and retry once.

For updates, send `If-Match` with the entity's ETag so you do not overwrite someone else's change (412 Precondition Failed tells you to re-read). Create a header with its items in one request through a deep insert, or group several operations in a `$batch` request, where each changeset succeeds or fails as a unit.

```python
import secrets

from fastapi import FastAPI, Request, Response
from fastapi.testclient import TestClient

# A tiny stand-in for SAP Gateway's CSRF protection.
erp = FastAPI()
TOKENS: dict[str, str] = {}  # session cookie -> CSRF token
ORDERS: list[dict] = []


@erp.get("/odata/A_PurchaseOrder")
def read(request: Request, response: Response) -> dict:
    if request.headers.get("x-csrf-token", "").lower() == "fetch":
        session = request.cookies.get("SAP_SESSIONID") or secrets.token_hex(8)
        TOKENS[session] = secrets.token_hex(16)
        response.set_cookie("SAP_SESSIONID", session)
        response.headers["x-csrf-token"] = TOKENS[session]
    return {"d": {"results": ORDERS}}


@erp.post("/odata/A_PurchaseOrder", status_code=201)
async def create(request: Request, response: Response) -> dict:
    session = request.cookies.get("SAP_SESSIONID")
    if session is None or TOKENS.get(session) != request.headers.get("x-csrf-token"):
        response.status_code = 403
        response.headers["x-csrf-token"] = "Required"
        return {"error": "CSRF token validation failed"}
    order = {**(await request.json()), "PurchaseOrder": f"45000{len(ORDERS) + 1:05d}"}
    ORDERS.append(order)
    return {"d": order}


def post_with_csrf(client: TestClient, url: str, body: dict) -> dict:
    """Fetch a token, POST, and on 403 'Required' refetch once (expired token or session)."""
    for attempt in range(2):
        if attempt == 1 or "x-csrf-token" not in client.headers:
            fetched = client.get(url, headers={"X-CSRF-Token": "Fetch"})
            client.headers["x-csrf-token"] = fetched.headers["x-csrf-token"]
        r = client.post(url, json=body)
        if r.status_code == 403 and r.headers.get("x-csrf-token", "").lower() == "required":
            continue
        r.raise_for_status()
        return r.json()["d"]
    raise RuntimeError("CSRF token rejected twice")


client = TestClient(erp)  # keeps cookies between requests, like a real session
po = post_with_csrf(client, "/odata/A_PurchaseOrder", {"Supplier": "17300001", "CompanyCode": "1010"})
assert po["PurchaseOrder"] == "4500000001"

TOKENS.clear()  # the server forgets every token: the session "expired"
po2 = post_with_csrf(client, "/odata/A_PurchaseOrder", {"Supplier": "17300002", "CompanyCode": "1010"})
assert po2["PurchaseOrder"] == "4500000002" and len(ORDERS) == 2

no_token = TestClient(erp).post("/odata/A_PurchaseOrder", json={"Supplier": "x"})
assert no_token.status_code == 403 and no_token.headers["x-csrf-token"] == "Required"
```

### How would an agent create a purchase order in SAP safely? {core}

Never let the model call the ERP directly. The agent proposes a structured action ("create PO: supplier, items, quantities, prices"), which is validated against a schema and business rules, mapped by an anti-corruption layer into the ERP's format, and shown to an approver as a human-readable preview with the totals. Only after approval does a worker call the ERP API, using a business reference derived from the run and step so a retry cannot create a second order, and the resulting PO number goes back into the run and the audit log.

Add limits around it: the agent's credential can create POs only for its tenant and within amount limits (the ERP's own authorisations should apply, ideally with the approver's or requester's identity propagated), a per-run budget, and a circuit breaker so an ERP outage pauses runs instead of failing them. This mirrors the HITL checkpoints in the agentic workflows you built at Quantiphi, where human review came before final submission to external APIs.

### How do you get exactly-once effects on an external system that may not support idempotency keys? {core}

You cannot get exactly-once delivery, but you can get exactly-once effects. If the API supports idempotency keys, send one per logical operation. If it does not (many ERPs do not), put your own business reference on the document (for example `AGENT-<run>-<step>` in a reference field the API allows), and before creating, query for a document with that reference. Locally, claim the step in your own database (a unique constraint) so two workers cannot both start it.

The subtle case is the **ambiguous timeout**: the request was sent, but the response never came. The order may or may not exist, so a blind retry can create a duplicate. Treat a timeout as "unknown": look the reference up again (with a short backoff, since the ERP may still be committing), and only retry the create when you are sure it did not happen. A nightly reconciliation job compares your records with the ERP's to catch anything left in doubt. The hard coding problem below implements this.

### What is an anti-corruption layer, and why put one in front of an ERP? {core}

It is a translation layer (from domain-driven design) that keeps an external system's model from leaking into yours. The ERP speaks in its own field names, codes, units, date formats and quirks (`/Date(…)/` strings, amounts as strings, leading zeros on material numbers, German unit codes); your platform speaks in its own clean domain types. The ACL maps in both directions, validates, and is the only code that knows the ERP's shape.

Benefits: the agent tools and UI never depend on SAP specifics, a second ERP is a new adapter rather than a rewrite, validation errors are caught in one place with clear messages, and you can test the mapping thoroughly with recorded payloads. Vendor migrations such as SOAP to REST show why: an application that talks to a vendor through one integration layer is far cheaper to migrate than one with the vendor's model spread through its code.

### How do you call fragile, rate-limited enterprise APIs without hurting them or yourself?

Assume they are slow, limited and sometimes down. Set a timeout on every call; retry only transient failures (connection errors, 429, 502, 503, 504) with exponential backoff and jitter, respecting `Retry-After`; never automatically retry non-idempotent writes unless you have the idempotency safeguards above. Put a circuit breaker in front so repeated failures fail fast and give the system room to recover, and a bulkhead (a separate concurrency pool per downstream) so a slow ERP does not exhaust the threads or connections the rest of the platform needs.

Control the rate centrally: route writes through a queue whose workers respect the ERP's limit (Cloud Tasks can rate-limit dispatch), and give each tenant a quota so one busy tenant cannot use the whole allowance. Cache reference data (suppliers, materials) that changes rarely.

### How do you authenticate to enterprise APIs? {deep}

Prefer standards in this order: OAuth 2.0 client credentials (short-lived tokens, cached and refreshed before expiry) for system-to-system calls; user-delegated tokens or **principal propagation** when the action must run with the end user's permissions (SAP BTP can propagate the user's identity to on-premises systems through the Cloud Connector); mTLS where the enterprise requires certificates; API keys or basic auth only when nothing better exists.

Whatever the mechanism, keep the secrets in Secret Manager, give each integration its own credential with the narrowest authorisations in the target system, rotate them, and never pass them to the model or log them. Many carrier and ERP APIs have moved from static credentials to OAuth tokens; FedEx's REST APIs, for example, use OAuth client credentials.

### How do cloud services reach an ERP that runs on-premises? {deep}

There are two common shapes. With SAP BTP, the **Cloud Connector** runs inside the customer's network and opens an outbound TLS tunnel to BTP, so BTP services and Integration Suite can call on-premises SAP without inbound firewall holes. On Google Cloud, connect the customer network with **Cloud VPN** or **Cloud Interconnect** into a VPC, and let Cloud Run reach it through **Direct VPC egress** (or a Serverless VPC Access connector); GKE pods are in the VPC already.

Either way, restrict which services may use that path, keep it in a dedicated subnet with firewall rules to just the ERP endpoints, and remember that latency to on-premises systems makes timeouts and async patterns even more important.

### How do you receive webhooks safely? {core}

Verify, deduplicate, acknowledge fast, process later. Verify the signature, typically an HMAC-SHA256 of the timestamp and the **raw** request body with a shared secret, compared in constant time; reject timestamps outside a small window (about five minutes) to stop replays; and record each event ID so a re-delivery is processed once. Then return `2xx` immediately and put the event on a queue, because senders retry on slow responses and you do not want to hold their connection while you call other systems.

Details that matter: compute the HMAC over the exact bytes received, not re-serialised JSON; support two active secrets during rotation; never trust the payload more than the signature allows (fetch the authoritative state from the source API when the action is important); and alert when signature failures spike. The coding problem below builds the verifier.

### How do you send webhooks to customers reliably? {deep}

Treat delivery as an outbox: write the event to a table in the same transaction as the change, then a worker delivers it. Sign every request (HMAC with a per-endpoint secret, a timestamp and an event ID), retry with exponential backoff for hours or days on failure, keep a dead-letter list with a replay button, and disable endpoints that fail for too long with a notification to the owner.

Give receivers what they need to be correct: a stable event ID for deduplication, an event type and version, and a sequence number or timestamp so they can ignore out-of-order deliveries. Specifications such as Standard Webhooks describe this format.

### Polling, webhooks, events or CDC: how do you detect changes in an enterprise system?

Prefer the system's own change notifications: webhooks or business events (SAP S/4HANA can publish business events through SAP Event Mesh) give low latency without load. If there are none, poll efficiently with a change marker: OData delta tokens where the service supports them, or a `LastChangeDateTime ge <last seen>` filter with a small overlap and deduplication. CDC directly on an ERP database is usually not allowed (and couples you to internal tables), so use it only for systems you own.

Whatever you choose, add a periodic full reconciliation, because events get lost and polls have gaps.

### What are the common data-mapping pitfalls with ERP data?

Money as floating point (always use decimals or integer minor units, and carry the currency); units of measure that differ by system and language (SAP's internal unit for pieces is `ST` in German-based systems, while the external code may be `PC`); time zones and date formats (v2 `/Date(…)/` values, dates without a time zone, fiscal calendars); identifiers with leading zeros (SAP stores material and supplier numbers zero-padded internally, so `12345` and `000000000000012345` may be the same thing); code lists that need lookup tables (status codes, plant and company codes); and master data that must exist before transactions reference it.

Map these explicitly in the anti-corruption layer, validate the result, and keep sample payloads from the real system as test fixtures.

### How do you read large data sets from an OData API? {deep}

Page with the server's own paging rather than inventing it: follow `__next` (v2) or `@odata.nextLink` (v4), which usually carry a `$skiptoken`, until there are none; ask only for the fields you need with `$select`; filter on the server; and keep page sizes the service allows. For keeping a copy in sync, use delta queries where available or a change-date filter, as above.

For truly large loads (initial migrations, analytics) do not page through a transactional API at all: use the bulk or replication tools the platform offers, schedule outside business hours, and agree the approach with the ERP team.

### How do you test enterprise integrations?

Layer it. Unit-test the mapping and validation with payloads recorded from the real system (including the ugly ones). Use contract tests or schema checks against the service's `$metadata` or OpenAPI document so a field rename breaks the build, not production. Run integration tests against a sandbox or a mock server that reproduces the protocol details (CSRF tokens, ETags, paging, error formats), and inject failures: timeouts after commit, 429s, 503s, expired tokens.

Finally, keep a small set of end-to-end checks against a test system, and reconciliation reports in production, because some problems only show up with real data.

### Tell me about an integration or migration you worked on. {core}

Use the FedEx SOAP-to-REST modernisation at The Dot Corp. Situation: about 24 legacy OrderingStore applications, plus more than 10 others, depended on FedEx SOAP integrations, and shipping and labelling cannot break. Task and action: the work covered application inventory, dependency analysis, implementation of the REST integration, and validation. Result: the FedEx integrations across those applications were modernised and validated. Explain why inventory and per-application validation matter when a break stops shipments.

Then connect it to the work in front of you: the same habits (inventory, a single integration layer, validation, careful rollout) are what make agent-driven ERP integrations safe. Keep to what the resume states; add details only from your memory.

### What changes when you migrate an integration from SOAP to REST?

The contract moves from a WSDL with XML schemas to resource URLs with JSON, usually described by OpenAPI; authentication typically moves from credentials in the SOAP envelope to OAuth tokens; errors move from SOAP faults to HTTP status codes with error bodies; and field names, enumerations and validation rules often change in subtle ways. Rate limits and token lifetimes appear where there were none.

So a safe migration maps old fields to new ones explicitly, runs both paths side by side on test data and compares the results, switches over one application or route at a time behind a flag, and keeps the old path available for rollback until the new one is proven.

## Coding problems

### Build an OData query URL safely {medium core}

Write `buildQuery(base, entitySet, query, version)` in TypeScript. `query` has optional `select` (field names), `filter` (a list of `[field, op, value]` joined with `and`), `orderBy`, `top`, `skip` and `count`. Literals must be formatted per OData version (strings in single quotes with embedded quotes doubled; dates as `datetime'…'` in v2 and unquoted ISO in v4), field names must be validated so they cannot inject filter syntax, and values must be percent-encoded while the `$` option names stay literal.

```text
buildQuery(base, 'A_PurchaseOrder', { select: ['PurchaseOrder', 'Supplier'],
  filter: [['Supplier', 'eq', "O'Neil Ltd"]], top: 50, count: true }, 2)
→ …/A_PurchaseOrder?$select=PurchaseOrder%2CSupplier&$filter=Supplier%20eq%20'O''Neil%20Ltd'&$top=50&$inlinecount=allpages&$format=json
```

#### Hints

1. Escaping in OData string literals is doubling the single quote, not a backslash.
2. Validate field names with a strict pattern (letters, digits, underscore, `/` for navigation paths); refuse anything else.
3. `encodeURIComponent` turns spaces into `%20` (some servers do not accept `+`) and leaves `'` alone; build the query string by hand so `$filter` is not encoded as `%24filter`.

#### Solution

Treat the filter like SQL: structure in, string out, with every value passed through a literal formatter and every field name checked against a pattern. That makes injection through either impossible.

```ts
import assert from 'node:assert/strict';

type Literal = string | number | boolean | null | Date;
type Op = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le';
type Query = {
  select?: string[];
  filter?: [field: string, op: Op, value: Literal][];
  orderBy?: [field: string, dir: 'asc' | 'desc'][];
  top?: number;
  skip?: number;
  count?: boolean;
};

const FIELD = /^[A-Za-z_][A-Za-z0-9_]*(\/[A-Za-z_][A-Za-z0-9_]*)*$/;
const OPS = new Set<Op>(['eq', 'ne', 'gt', 'ge', 'lt', 'le']);

function field(name: string): string {
  if (!FIELD.test(name)) throw new Error(`invalid field name: ${name}`);
  return name;
}

export function literal(value: Literal, version: 2 | 4): string {
  if (value === null) return 'null';
  if (value instanceof Date) {
    const iso = value.toISOString().replace(/\.000Z$/, 'Z');
    return version === 2 ? `datetime'${iso.replace(/Z$/, '')}'` : iso;
  }
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('invalid number');
  return String(value);
}

export function buildQuery(base: string, entitySet: string, q: Query, version: 2 | 4): string {
  const params: [string, string][] = [];
  if (q.select?.length) params.push(['$select', q.select.map(field).join(',')]);
  if (q.filter?.length) {
    const clauses = q.filter.map(([f, op, v]) => {
      if (!OPS.has(op)) throw new Error(`invalid operator: ${op}`);
      return `${field(f)} ${op} ${literal(v, version)}`;
    });
    params.push(['$filter', clauses.join(' and ')]);
  }
  if (q.orderBy?.length) params.push(['$orderby', q.orderBy.map(([f, d]) => `${field(f)} ${d === 'desc' ? 'desc' : 'asc'}`).join(',')]);
  for (const [name, n] of [['$top', q.top], ['$skip', q.skip]] as const) {
    if (n === undefined) continue;
    if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
    params.push([name, String(n)]);
  }
  if (q.count) params.push(version === 2 ? ['$inlinecount', 'allpages'] : ['$count', 'true']);
  if (version === 2) params.push(['$format', 'json']);
  const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${base.replace(/\/$/, '')}/${field(entitySet)}${query ? `?${query}` : ''}`;
}

const base = 'https://erp.example.com/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/';
const v2 = buildQuery(base, 'A_PurchaseOrder', {
  select: ['PurchaseOrder', 'Supplier'],
  filter: [['Supplier', 'eq', "O'Neil Ltd"], ['CreationDate', 'ge', new Date('2026-10-01T00:00:00Z')]],
  orderBy: [['CreationDate', 'desc']],
  top: 50,
  count: true,
}, 2);
const params = new URL(v2).searchParams;
assert.ok(v2.startsWith(`${base}A_PurchaseOrder?$select=PurchaseOrder%2CSupplier&$filter=Supplier%20eq%20'O''Neil%20Ltd'`));
assert.equal(params.get('$filter'), "Supplier eq 'O''Neil Ltd' and CreationDate ge datetime'2026-10-01T00:00:00'");
assert.equal(params.get('$orderby'), 'CreationDate desc');
assert.equal(params.get('$inlinecount'), 'allpages');
assert.equal(params.get('$format'), 'json');

const v4 = new URL(buildQuery(base, 'PurchaseOrder', { filter: [['CreationDate', 'ge', new Date('2026-10-01T00:00:00Z')]], count: true }, 4));
assert.equal(v4.searchParams.get('$filter'), 'CreationDate ge 2026-10-01T00:00:00Z');
assert.equal(v4.searchParams.get('$count'), 'true');
assert.equal(v4.searchParams.get('$format'), null);

assert.equal(literal(null, 4), 'null');
assert.equal(literal(42.5, 4), '42.5');
assert.throws(() => buildQuery(base, 'A_PurchaseOrder', { filter: [["Supplier eq '1' or 1 eq 1", 'eq', 'x']] }, 2), /invalid field/);
assert.throws(() => buildQuery(base, 'A_PurchaseOrder', { top: -1 }, 2), /non-negative/);
assert.throws(() => literal(Number.NaN, 4), /invalid number/);
assert.equal(buildQuery(base, 'A_PurchaseOrder', {}, 4), `${base}A_PurchaseOrder`);
```

Complexity: linear in the size of the query.

#### Follow-ups

- **Why not let the agent write `$filter` strings?** The same reason you do not let it write SQL: it can be steered into reading other data. The tool takes structured arguments; the builder writes the syntax.
- **`or`, `contains`, `in`?** Add them as structured nodes (`{ or: [...] }`), never as raw strings.
- **Typed numbers in v2?** OData v2 literals carry their type: an `Edm.Decimal` is written `120.50M` and an `Edm.Int64` `5L`. Read each property's type from `$metadata` and format the literal to match; v4 drops the suffixes.

### Page through an OData collection, v2 or v4 {medium}

Write an async generator `rows(fetchJson, firstUrl, maxPages)` in TypeScript that yields every row of a paged OData collection. It must handle v2 (`{ d: { results, __next } }`) and v4 (`{ value, '@odata.nextLink' }`) shapes, resolve relative next links against the current URL, convert v2 `/Date(ms)/` strings to ISO strings, and stop with an error after `maxPages` so a broken server cannot loop forever.

#### Hints

1. Normalise each response to `{ rows, next }` first, then the loop is the same for both versions.
2. `new URL(next, currentUrl)` resolves both absolute and relative links.
3. The v2 date pattern is `/Date(1791936000000)/`, sometimes with an offset such as `+0000`.

#### Solution

```ts
import assert from 'node:assert/strict';

type Json = Record<string, unknown>;
type FetchJson = (url: string) => Promise<Json>;

const V2_DATE = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/;

function normaliseRow(row: Json): Json {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => {
      const m = typeof v === 'string' ? V2_DATE.exec(v) : null;
      return [k, m ? new Date(Number(m[1])).toISOString() : v];
    }),
  );
}

function page(body: Json): { rows: Json[]; next?: string } {
  if (body.d && typeof body.d === 'object') {
    const d = body.d as { results?: Json[]; __next?: string };
    return { rows: d.results ?? [], next: d.__next };
  }
  return { rows: (body.value as Json[] | undefined) ?? [], next: body['@odata.nextLink'] as string | undefined };
}

export async function* rows(fetchJson: FetchJson, firstUrl: string, maxPages = 1000): AsyncGenerator<Json> {
  let url: string | undefined = firstUrl;
  for (let n = 0; url; n++) {
    if (n === maxPages) throw new Error(`stopped after ${maxPages} pages`);
    const { rows: batch, next } = page(await fetchJson(url));
    for (const row of batch) yield normaliseRow(row);
    url = next ? new URL(next, url).toString() : undefined;
  }
}

// A fake v2 service with two pages and a relative next link.
const v2Pages: Record<string, Json> = {
  'https://erp.example.com/odata/A_PurchaseOrder?$top=2': {
    d: { results: [{ PurchaseOrder: '4500000001', CreationDate: '/Date(1791936000000)/' }, { PurchaseOrder: '4500000002' }], __next: 'A_PurchaseOrder?$skiptoken=2' },
  },
  'https://erp.example.com/odata/A_PurchaseOrder?$skiptoken=2': { d: { results: [{ PurchaseOrder: '4500000003', CreationDate: '/Date(1790812800000+0000)/' }] } },
};
const seen: string[] = [];
const fakeFetch: FetchJson = async (url) => {
  seen.push(url);
  const body = v2Pages[url];
  if (!body) throw new Error(`unexpected URL ${url}`);
  return body;
};

const all: Json[] = [];
for await (const row of rows(fakeFetch, 'https://erp.example.com/odata/A_PurchaseOrder?$top=2')) all.push(row);
assert.deepEqual(all.map((r) => r.PurchaseOrder), ['4500000001', '4500000002', '4500000003']);
assert.equal(all[0].CreationDate, '2026-10-14T00:00:00.000Z');
assert.equal(all[2].CreationDate, '2026-10-01T00:00:00.000Z');
assert.equal(seen.length, 2);

// v4 shape, and a server whose next link points back to itself.
const loop: FetchJson = async () => ({ value: [{ PurchaseOrder: 'x' }], '@odata.nextLink': 'https://erp.example.com/v4/PurchaseOrder?$skiptoken=1' });
const consume = async () => {
  for await (const row of rows(loop, 'https://erp.example.com/v4/PurchaseOrder', 3)) void row;
};
await assert.rejects(consume(), /stopped after 3 pages/);
```

Complexity: O(total rows); memory is one page at a time because it is a generator.

#### Follow-ups

- **Resuming after a crash halfway?** Persist the last next link (or the last seen key with keyset filtering) after each page, and make the downstream write idempotent so re-reading a page is harmless.
- **Rate limits?** Wrap `fetchJson` with a limiter and retry on 429 with `Retry-After`.

### Map an SAP purchase order into your domain model {medium core}

Write the anti-corruption layer for reading purchase orders. Input is an SAP-style OData v2 payload (amounts and quantities as strings, `/Date(ms)/` dates, SAP unit codes, items under `to_PurchaseOrderItem.results`). Output is a validated domain `Order` with `Decimal` money, a real `date`, your own unit codes and a computed total. If anything is wrong, raise one error that lists every problem, not just the first.

#### Hints

1. Use Pydantic models for the domain types: `Decimal` fields with constraints, a `Literal` for units, `min_length=1` for lines.
2. Convert the SAP quirks before validation (date parsing, unit lookup), and collect failures in a list as you go.
3. Catch `ValidationError` and merge its `errors()` into your list, so the caller gets one complete report.

#### Solution

The mapper is the only code that knows SAP's field names and formats. It translates, then lets Pydantic enforce the domain rules, and reports all problems together so a human (or the agent) can fix the source in one go.

```python
import re
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, computed_field


class OrderLine(BaseModel):
    model_config = ConfigDict(frozen=True)
    line: int
    sku: str = Field(min_length=1)
    quantity: Decimal = Field(gt=0)
    unit: Literal["EA", "BOX", "KG"]
    unit_price: Decimal = Field(ge=0)


class Order(BaseModel):
    model_config = ConfigDict(frozen=True)
    erp_id: str
    supplier_id: str
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    created_on: date
    lines: list[OrderLine] = Field(min_length=1)

    @computed_field
    @property
    def total(self) -> Decimal:
        return sum((l.quantity * l.unit_price for l in self.lines), Decimal("0"))


class MappingError(ValueError):
    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


# SAP unit codes depend on the system's configuration and language: ST is "Stück" (piece) in German-based systems.
UNITS = {"PC": "EA", "ST": "EA", "EA": "EA", "BOX": "BOX", "KG": "KG"}
SAP_DATE = re.compile(r"^/Date\((-?\d+)(?:[+-]\d{4})?\)/$")


def external_number(value: str | None) -> str:
    """SAP's ALPHA conversion pads purely numeric numbers with zeros; alphanumeric ones are stored as typed."""
    value = value or ""
    return (value.lstrip("0") or "0") if value.isdigit() else value


def sap_date(value: str) -> date:
    m = SAP_DATE.match(value or "")
    if not m:
        raise ValueError(f"not an OData v2 date: {value!r}")
    return datetime.fromtimestamp(int(m[1]) / 1000, UTC).date()


def to_order(payload: dict) -> Order:
    d = payload.get("d", {})
    problems: list[str] = []
    lines = []
    for item in d.get("to_PurchaseOrderItem", {}).get("results", []):
        unit = UNITS.get(item.get("PurchaseOrderQuantityUnit", ""))
        if unit is None:
            problems.append(f"item {item.get('PurchaseOrderItem')}: unknown unit {item.get('PurchaseOrderQuantityUnit')!r}")
        lines.append({
            "line": item.get("PurchaseOrderItem"),
            "sku": external_number(item.get("Material")),
            "quantity": item.get("OrderQuantity"),
            "unit": unit or "?",
            "unit_price": item.get("NetPriceAmount"),
        })
    try:
        created = sap_date(d.get("CreationDate", ""))
    except ValueError as error:
        problems.append(str(error))
        created = None
    try:
        order = Order(
            erp_id=d.get("PurchaseOrder", ""),
            supplier_id=external_number(d.get("Supplier")),
            currency=d.get("DocumentCurrency", ""),
            created_on=created or date.min,
            lines=lines,
        )
    except ValidationError as error:
        problems += [
            f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in error.errors() if e["loc"][-1:] != ("unit",)
        ]  # unknown units are already reported with a clearer message
        order = None
    if problems:
        raise MappingError(problems)
    return order


sample = {"d": {
    "PurchaseOrder": "4500000123", "Supplier": "0017300001", "DocumentCurrency": "EUR",
    "CreationDate": "/Date(1791936000000)/",
    "to_PurchaseOrderItem": {"results": [
        {"PurchaseOrderItem": "10", "Material": "000000000000012345", "OrderQuantity": "5", "PurchaseOrderQuantityUnit": "ST", "NetPriceAmount": "120.50"},
        {"PurchaseOrderItem": "20", "Material": "TG12", "OrderQuantity": "2.000", "PurchaseOrderQuantityUnit": "BOX", "NetPriceAmount": "99.99"},
    ]},
}}
order = to_order(sample)
assert order.created_on == date(2026, 10, 14)
assert order.supplier_id == "17300001" and order.lines[0].sku == "12345" and order.lines[0].unit == "EA"
assert order.total == Decimal("802.48") and isinstance(order.total, Decimal)  # 5 x 120.50 + 2 x 99.99, no float rounding
assert external_number("0A12") == "0A12" and external_number("000") == "0"  # never strip zeros from alphanumeric numbers

bad = {"d": {**sample["d"], "DocumentCurrency": "euro", "CreationDate": "2026-10-14",
             "to_PurchaseOrderItem": {"results": [
                 {"PurchaseOrderItem": "10", "Material": "X1", "OrderQuantity": "-1", "PurchaseOrderQuantityUnit": "DOZ", "NetPriceAmount": "1"}]}}}
try:
    to_order(bad)
    raise AssertionError("should fail")
except MappingError as error:
    text = " | ".join(error.problems)
    assert "item 10: unknown unit 'DOZ'" in text
    assert "not an OData v2 date: '2026-10-14'" in text
    assert "currency" in text and "lines.0.quantity" in text
    assert len(error.problems) == 4

try:
    to_order({"d": {**sample["d"], "to_PurchaseOrderItem": {"results": []}}})
    raise AssertionError("an order without lines should fail")
except MappingError as error:
    assert error.problems[0].startswith("lines:")
```

Complexity: O(items). The value is in the explicit, tested mapping, not the algorithm.

#### Follow-ups

- **And the write direction?** A second mapper from your domain to the ERP's create payload, validated against the service's `$metadata` in tests, with unit and currency lookups reversed.
- **Where do unit and code tables come from?** Configuration per ERP connection (they differ by system), cached and versioned, not hard-coded.

### Verify a signed webhook with replay protection {medium core}

An enterprise system sends events to your endpoint with a header `Signature: t=<unix seconds>,v1=<hex HMAC>` where the HMAC-SHA256 is computed over `"<t>.<raw body>"`. During secret rotation it may send several `v1=` values. Write `verify(headers, raw_body, secrets, now, seen)` that returns the parsed event only if a signature matches one of the active secrets, the timestamp is within five minutes, and the event ID has not been processed before.

#### Hints

1. Parse the header into a timestamp and a list of signatures; compute the expected HMAC for each active secret.
2. Compare with `hmac.compare_digest`, and check the timestamp before doing any work with the body.
3. Keep seen event IDs with an expiry a little longer than the tolerance window; record the ID only after the signature is valid.

#### Solution

```python
import hashlib
import hmac
import json

TOLERANCE = 300  # seconds


class WebhookError(ValueError):
    pass


def sign(secret: str, t: int, body: bytes) -> str:
    return hmac.new(secret.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()


def verify(headers: dict[str, str], raw_body: bytes, secrets: list[str], now: int, seen: dict[str, int]) -> dict:
    try:
        fields = [part.split("=", 1) for part in headers["signature"].split(",")]
        t = int(next(v for k, v in fields if k == "t"))
        candidates = [v for k, v in fields if k == "v1"]
    except (KeyError, StopIteration, ValueError):
        raise WebhookError("malformed signature header") from None
    if abs(now - t) > TOLERANCE:
        raise WebhookError("timestamp outside tolerance")
    expected = [sign(s, t, raw_body) for s in secrets]
    if not any(hmac.compare_digest(e, c) for e in expected for c in candidates):
        raise WebhookError("bad signature")
    event = json.loads(raw_body)  # only now is the body trusted
    if not isinstance(event, dict) or "id" not in event:
        raise WebhookError("event without an id")
    for event_id, expires in list(seen.items()):
        if expires < now:
            del seen[event_id]
    if event["id"] in seen:
        raise WebhookError("duplicate event")
    seen[event["id"]] = now + 2 * TOLERANCE
    return event


body = b'{"id":"evt_1","type":"purchase_order.approved","po":"4500000123"}'
now = 1_791_936_000
seen: dict[str, int] = {}
headers = {"signature": f"t={now},v1={sign('whsec_new', now, body)}"}
assert verify(headers, body, ["whsec_new"], now + 10, seen)["type"] == "purchase_order.approved"


def error(h: dict[str, str], b: bytes = body, secrets: list[str] = ["whsec_new"], at: int = now) -> str:
    try:
        verify(h, b, secrets, at, seen)
    except WebhookError as e:
        return str(e)
    return "accepted"


assert error(headers) == "duplicate event"  # the same delivery again
assert error(headers, body.replace(b"4500000123", b"4500009999")) == "bad signature"  # tampered body
assert error(headers, at=now + 3600) == "timestamp outside tolerance"  # an old capture replayed later
assert error({"signature": "garbage"}) == "malformed signature header"
assert error({}) == "malformed signature header"

# Rotation: the sender signs with old and new secrets; we accept while either is active.
body2 = b'{"id":"evt_2","type":"invoice.posted"}'
rotating = {"signature": f"t={now},v1={sign('whsec_old', now, body2)},v1={sign('whsec_new', now, body2)}"}
assert error(rotating, body2, secrets=["whsec_old"]) == "accepted"
assert error({"signature": f"t={now},v1={sign('whsec_old', now, b'{\"id\":\"evt_3\"}')}"}, b'{"id":"evt_3"}', secrets=["whsec_new"]) == "bad signature"
```

Complexity: O(body length × secrets × signatures), all tiny. The seen-ID store is a Redis `SET NX` with a TTL in production.

#### Follow-ups

- **Why the raw body?** Re-serialising parsed JSON can change whitespace or key order, so the HMAC no longer matches; frameworks need to give you the bytes before parsing.
- **Then what?** Return 2xx immediately and enqueue the event; the worker fetches the authoritative PO state from the ERP before acting on it.

### Create an ERP document exactly once despite ambiguous timeouts {hard}

A worker must create a purchase order in an ERP that has no idempotency keys, but lets you store your own reference on the document and query by it. The network may time out **after** the ERP committed the order. Write `create_once(erp, request)` that never creates duplicates, retries genuinely failed attempts, and does not retry business validation errors.

#### Hints

1. Derive a stable reference from the run and step (`AGENT-<run>-<step>`), and look it up before creating anything.
2. A timeout means "unknown": look the reference up again before retrying the create. The ERP may need a moment, so check a few times with a short backoff.
3. Distinguish transient errors (timeouts, 503) from permanent ones (400 validation): only the first kind is retried.

#### Solution

Make the external call safe by making the question "does it already exist?" answerable. The reference turns create into "find or create", and a timeout leads to another find, not a blind retry.

```python
import itertools
from dataclasses import dataclass, field


class Timeout(Exception):
    pass


class Unavailable(Exception):
    pass


class Rejected(Exception):
    """A 4xx business error: retrying will not help."""


@dataclass
class FakeErp:
    """Commits orders, but can be told to time out before or after committing."""
    script: list[str] = field(default_factory=list)  # per create call: "ok", "timeout-after-commit", "timeout-before-commit", "503"
    orders: dict[str, dict] = field(default_factory=dict)  # number -> order
    numbers: itertools.count = field(default_factory=lambda: itertools.count(4500000001))
    creates: int = 0

    def find_by_reference(self, reference: str) -> dict | None:
        return next((o for o in self.orders.values() if o["reference"] == reference), None)

    def create(self, payload: dict) -> dict:
        self.creates += 1
        mode = self.script.pop(0) if self.script else "ok"
        if payload.get("quantity", 0) <= 0:
            raise Rejected("quantity must be positive")
        if mode in ("503", "timeout-before-commit"):
            raise Unavailable() if mode == "503" else Timeout()
        order = {**payload, "number": str(next(self.numbers))}
        self.orders[order["number"]] = order
        if mode == "timeout-after-commit":
            raise Timeout()  # committed, but the caller never hears about it
        return order


def create_once(erp: FakeErp, request: dict, attempts: int = 4, sleep=lambda s: None) -> dict:
    reference = f"AGENT-{request['run_id']}-{request['step']}"
    payload = {k: v for k, v in request.items() if k not in ("run_id", "step")} | {"reference": reference}
    for attempt in range(attempts):
        existing = erp.find_by_reference(reference)
        if existing is not None:
            return existing  # already done, by us earlier or by a previous worker
        try:
            return erp.create(payload)
        except Rejected:
            raise  # permanent: surface to the run (and the human), do not retry
        except (Timeout, Unavailable):
            sleep(0.5 * 2**attempt)  # back off, then ask again before retrying
    existing = erp.find_by_reference(reference)
    if existing is not None:
        return existing
    raise RuntimeError(f"outcome unknown for {reference}; flag for reconciliation")


req = {"run_id": "r-7", "step": 3, "supplier": "17300001", "sku": "TG12", "quantity": 2}

erp = FakeErp(script=["timeout-after-commit"])
assert create_once(erp, req)["number"] == "4500000001"
assert len(erp.orders) == 1 and erp.creates == 1  # found by reference, no second create

erp = FakeErp(script=["timeout-before-commit", "503", "ok"])
assert create_once(erp, req)["number"] == "4500000001"
assert len(erp.orders) == 1 and erp.creates == 3

erp = FakeErp()
first = create_once(erp, req)
again = create_once(erp, req)  # the whole step re-runs after a worker crash
assert first == again and len(erp.orders) == 1 and erp.creates == 1

erp = FakeErp()
try:
    create_once(erp, {**req, "quantity": 0})
    raise AssertionError("should be rejected")
except Rejected:
    assert erp.creates == 1 and not erp.orders  # not retried

erp = FakeErp(script=["503"] * 10)
try:
    create_once(erp, req)
    raise AssertionError("should give up")
except RuntimeError as error:
    assert "reconciliation" in str(error) and erp.creates == 4
```

Complexity: at most `attempts` creates and `attempts + 1` lookups. The correctness argument: a create only happens after a lookup has shown the reference does not exist, and the only way to have two orders would be for a lookup to miss a committed order, which the backoff and a final reconciliation job guard against.

#### Follow-ups

- **Two workers on the same step at once?** Claim the step first in your own database (a unique row per run and step, or `SELECT … FOR UPDATE SKIP LOCKED`), so only one worker calls the ERP.
- **What if the ERP cannot store a reference at all?** Use a natural key you can search on (supplier, amount, date, your run ID in a text field), or route creation through an integration layer that keeps its own idempotency table, and lean harder on reconciliation.
