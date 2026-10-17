---
title: Building on LLM APIs: streaming, tools and structured output
goal: Explain how an application calls, streams, validates and pays for LLM output, and design the reliable layer between a model API and a streaming chat UI.
minutes: 45
---

This platform exists to run agents, and every agent turn is an LLM call: the chat UI streams the model's answer token
by token, and the orchestration services turn tool calls into real actions. This is not an ML role, so nobody will ask
you to train a model. They will ask how you call one **reliably**: how streaming works on the wire, how tool calling and
structured output work, what you do about rate limits and failures halfway through a stream, and how you keep latency
and cost under control.

Your strongest material is the Pydantic structured-output gate you built at Quantiphi. The theme to come back to: **the
model proposes, your code validates, and your own event protocol (not the provider's) is what reaches the browser.**

## The request loop

Chat APIs are, at heart, stateless: you send the whole conversation every time, with roles (`system` or
`developer` instructions, `user`, `assistant`, `tool`), the tools the model may call, and limits such as `max_tokens`.
The model returns text, or a request to call a tool, or both. Some APIs can keep the conversation for you (OpenAI's
Responses API can chain turns with `previous_response_id`), but you still pay for the full context on every turn.

| Term | What it means for your code |
|---|---|
| Token | The unit of billing and of limits. Roughly 4 characters of English per token; code and other languages differ. |
| Context window | The maximum input plus output tokens in one call. History, tool definitions, retrieved documents and the answer all share it. |
| `max_tokens` | Caps the **output**. Too low truncates answers (check the stop reason); too high wastes budget on runaway output. |
| Stop reason | Why generation ended: natural end, length limit, tool call, stop sequence, safety. Always check it. |
| Temperature / top-p | Sampling randomness. Low for extraction and tool use, higher for drafting. Temperature 0 is still not fully deterministic. |

## How the providers stream

All three major APIs stream over **Server-Sent Events**, but the event shapes differ, so a backend should translate them
into one internal event format before anything reaches the browser.

| API | Wire format | Text arrives as | Tool-call arguments arrive as | End of stream and usage |
|---|---|---|---|---|
| OpenAI Chat Completions | `data:` lines with JSON chunks | `choices[0].delta.content` | `delta.tool_calls[i].function.arguments` fragments | `data: [DONE]`; usage only with `stream_options.include_usage` |
| OpenAI Responses | Typed events (`event:` + `data:`) | `response.output_text.delta` | `response.function_call_arguments.delta`, then `.done` | `response.completed` carries the final response and usage |
| Anthropic Messages | Typed events | `content_block_delta` with a `text_delta` | `content_block_delta` with `input_json_delta` (partial JSON) | `message_delta` (stop reason, output usage), then `message_stop` |
| Gemini (`streamGenerateContent`) | SSE with `alt=sse` | Each chunk is a partial response: `candidates[].content.parts[].text` | `functionCall` parts | The last chunk carries `finishReason` and usage metadata |

The engineering points interviewers listen for:

- **Accumulate deltas in order.** Text is appended; tool-call arguments are **partial JSON** and must not be parsed
  until the block or item is finished.
- **Errors can arrive after a `200 OK`.** Anthropic, for example, can send an `error` event mid-stream when the service
  is overloaded. The HTTP status is no longer a reliable signal once streaming starts.
- **Usage comes last.** Token counts for billing and budgets arrive at the end (or only on request), so record them
  when the stream completes and estimate them if it is cut off.
- **Translate, then forward.** The UI should receive your own small set of events (`token`, `tool_call`, `step`,
  `error`, `done`), so you can switch providers, add agent events, and keep provider details out of the browser.

This adapter turns simplified Anthropic-style events into internal events. The same shape works for any provider: one
adapter per provider, one protocol to the UI.

```python
import json
from collections.abc import Iterable, Iterator

def from_anthropic(events: Iterable[dict]) -> Iterator[dict]:
    """Translate Anthropic Messages stream events into the app's own event protocol."""
    tools: dict[int, dict] = {}  # content block index -> tool call being assembled
    stop_reason = None
    for ev in events:
        kind = ev["type"]
        if kind == "content_block_start" and ev["content_block"]["type"] == "tool_use":
            block = ev["content_block"]
            tools[ev["index"]] = {"id": block["id"], "name": block["name"], "json": ""}
        elif kind == "content_block_delta":
            delta = ev["delta"]
            if delta["type"] == "text_delta":
                yield {"type": "token", "text": delta["text"]}
            elif delta["type"] == "input_json_delta":
                tools[ev["index"]]["json"] += delta["partial_json"]  # partial JSON: do not parse yet
        elif kind == "content_block_stop" and ev["index"] in tools:
            call = tools.pop(ev["index"])
            yield {"type": "tool_call", "id": call["id"], "name": call["name"], "args": json.loads(call["json"] or "{}")}
        elif kind == "message_delta":
            stop_reason = ev["delta"].get("stop_reason")
        elif kind == "error":
            yield {"type": "error", "message": ev["error"]["type"]}
            return
        elif kind == "message_stop":
            yield {"type": "done", "stop_reason": stop_reason}

stream = [
    {"type": "message_start", "message": {"id": "msg_1"}},
    {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
    {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Checking run "}},
    {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "r-42."}},
    {"type": "content_block_stop", "index": 0},
    {"type": "content_block_start", "index": 1, "content_block": {"type": "tool_use", "id": "toolu_1", "name": "get_run", "input": {}}},
    {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": '{"run_'}},
    {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": 'id": "r-42"}'}},
    {"type": "content_block_stop", "index": 1},
    {"type": "message_delta", "delta": {"stop_reason": "tool_use"}},
    {"type": "message_stop"},
]
out = list(from_anthropic(stream))
assert "".join(e["text"] for e in out if e["type"] == "token") == "Checking run r-42."
assert out[-2] == {"type": "tool_call", "id": "toolu_1", "name": "get_run", "args": {"run_id": "r-42"}}
assert out[-1] == {"type": "done", "stop_reason": "tool_use"}

overloaded = stream[:4] + [{"type": "error", "error": {"type": "overloaded_error"}}]
assert list(from_anthropic(overloaded))[-1] == {"type": "error", "message": "overloaded_error"}
```

## Tool calling and structured output

The model never runs anything. You describe each tool with a name, a description and a **JSON schema** for its
arguments; the model replies with a tool call; **your code** validates the arguments, checks permissions, runs the tool
and sends the result back as a tool message tied to the call ID; the loop repeats until the model answers.

Defining the arguments once as a Pydantic model (or a zod schema in TypeScript) means the schema you send and the
validation you run can never drift apart.

```python
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, Field, ValidationError

class CreatePurchaseRequest(BaseModel):
    """Draft a purchase request in the ERP. Does not submit it: a human approves first."""
    vendor_id: str = Field(pattern=r"^V\d{6}$", description="ERP vendor number, e.g. V001234")
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    currency: Literal["USD", "EUR", "GBP"]
    cost_center: str = Field(min_length=4, max_length=10)

tool = {
    "name": "create_purchase_request",
    "description": CreatePurchaseRequest.__doc__,
    "parameters": CreatePurchaseRequest.model_json_schema(),
}
props = tool["parameters"]["properties"]
assert tool["parameters"]["required"] == ["vendor_id", "amount", "currency", "cost_center"]
assert props["currency"]["enum"] == ["USD", "EUR", "GBP"]

# Whatever the model sends back goes through the same model before anything runs.
ok = CreatePurchaseRequest.model_validate({"vendor_id": "V001234", "amount": "1250.00", "currency": "USD", "cost_center": "ENG-42"})
assert ok.amount == Decimal("1250.00")
try:
    CreatePurchaseRequest.model_validate({"vendor_id": "ACME", "amount": -5, "currency": "INR", "cost_center": "X"})
except ValidationError as err:
    assert {e["loc"][0] for e in err.errors()} == {"vendor_id", "amount", "currency", "cost_center"}
else:
    raise AssertionError("invalid arguments must be rejected")
```

For structured output (the model's answer itself must match a schema) there are three levels of strength:

| Approach | How | Guarantee |
|---|---|---|
| Prompt only | "Reply with JSON like …" | None: always validate |
| Forced tool call | Give one tool and force the model to call it (`tool_choice`) | Valid JSON in practice, but still validate the content |
| Schema-constrained decoding | OpenAI structured outputs (`json_schema` with `strict: true`), Gemini `response_schema` with a JSON MIME type, Claude JSON outputs (`output_config.format`) and strict tool use (`strict: true` on a tool) | The output parses and matches the schema's shape (within the supported subset of JSON Schema) |

Even with constrained decoding you still validate: a schema guarantees **shape**, not **truth**. A well-formed purchase
request can still name the wrong vendor. Business rules, cross-checks and, for risky actions, human approval sit on top.

## Reliability: rate limits, timeouts, failures mid-stream

| Failure | What you do |
|---|---|
| `429` rate limited | Retry with exponential backoff plus jitter, honour `Retry-After` when present, and queue or shed load per tenant |
| `5xx`, overloaded (Anthropic uses `529`), network reset | Retry a bounded number of times; fail over to another region or model for interactive traffic |
| `400` invalid request, `401`/`403` | Never retry: fix the request or the credentials |
| Context too long | Trim or summarise history before sending; do not retry the same request |
| Stream cut off mid-answer | Keep what was streamed; either show it as partial with a "continue" action or restart the turn. Do not silently replay tool calls that already ran |
| Slow first token | A separate time-to-first-token timeout, shorter than the total timeout, so a stuck call fails fast |

Side effects make retries dangerous: if a tool call already created a purchase request, retrying the whole turn can
create a second one. That is why write tools take an **idempotency key**, and why a retry repeats the model call, not
the tools that already ran.

## Latency and cost

Three latency numbers matter: **time to first token** (what the user feels), **output tokens per second** (how fast the
answer fills in) and **total time**. Streaming improves perceived latency, not total latency. Output tokens are slower
and pricier than input tokens, so a long answer costs more than a long prompt.

The levers, in rough order of impact:

- **Smaller models for easy steps** (routing, classification, extraction) and the large model only for hard reasoning.
- **Fewer, shorter calls:** a workflow instead of an open-ended agent loop; compact tool results; capped `max_tokens`.
- **Prompt caching:** long shared prefixes (system prompt, tool definitions, policy documents) are cached by the
  provider, automatically or with explicit cache markers depending on the API, which cuts latency and input cost.
- **Parallel tool calls** when the steps are independent.
- **Batch APIs** for offline work: the major providers offer asynchronous batch endpoints, typically at about half the
  standard price, in exchange for results within hours instead of seconds.
- **Measure per completed task,** not per call: retries and loops are where the money goes.

This measures time to first token and throughput from any async token stream, the numbers you would put on the
operations dashboard.

```python
import asyncio
import time
from collections.abc import AsyncIterator

async def fake_llm(tokens: list[str], first_delay: float, gap: float) -> AsyncIterator[str]:
    await asyncio.sleep(first_delay)
    for tok in tokens:
        yield tok
        await asyncio.sleep(gap)

async def measure(stream: AsyncIterator[str]) -> dict:
    start = time.perf_counter()
    first = None
    count = 0
    async for _ in stream:
        if first is None:
            first = time.perf_counter() - start
        count += 1
    total = time.perf_counter() - start
    gen_time = total - (first or 0)
    return {"ttft": first, "tokens": count, "tokens_per_s": count / gen_time if gen_time > 0 else 0.0, "total": total}

stats = asyncio.run(measure(fake_llm(["a"] * 20, first_delay=0.15, gap=0.005)))
assert stats["tokens"] == 20
assert 0.15 <= stats["ttft"] < 0.5          # the first token waited for the slow start
assert stats["total"] >= stats["ttft"]
assert stats["tokens_per_s"] > 20
```

## Evaluation, guardrails and observability

- **Evaluation:** a golden set of real tasks with expected results, checked by code where possible (schema valid,
  right tool, right arguments) and by humans or a calibrated LLM judge otherwise. It runs in CI on every prompt, model
  or tool change, like unit tests.
- **Guardrails:** input limits, untrusted text wrapped and labelled as data (prompt injection), output validation,
  allow-listed tools with least-privilege credentials, approval for side effects. The [web security](#/web-security)
  chapter covers injection in depth.
- **Observability:** trace every call with prompt version, model, tokens, latency, cost, tool calls and validation
  results, tied to the run ID the UI shows. OpenTelemetry has emerging GenAI conventions, and LangSmith or Langfuse give
  LLM-specific views. Redact personal data and secrets before they reach traces.

## Calling Gemini on Google Cloud

On GCP you reach Gemini either through the **Gemini Developer API** (API key) or through **Vertex AI** (IAM, service
accounts, VPC Service Controls, regional or global endpoints, enterprise data terms). In April 2026 Google folded Vertex
AI into the **Gemini Enterprise Agent Platform** (for example, Vertex AI Studio is now Agent Studio), but the API still
lives at `aiplatform.googleapis.com` and most people still say "Vertex AI", so use both names. The `google-genai` SDK
supports both routes; on Cloud Run, the enterprise route uses the service's identity through Application Default
Credentials, so there is no key to leak.

Model IDs retire on a published schedule (a Gemini version is typically retired some months after its successor
ships), so keep the model ID in configuration, not in code, and re-run your evaluation set before switching.

```python norun
# Needs the google-genai package and Google Cloud credentials, so it is not run here.
import os
from google import genai

client = genai.Client(vertexai=True, project="my-project", location="global")
for chunk in client.models.generate_content_stream(
    model=os.environ["GEMINI_MODEL"],  # a current model ID your platform has approved, from config
    contents="Summarise agent run r-42 in two sentences.",
):
    print(chunk.text or "", end="", flush=True)
```

## Interview questions

### Walk me through what happens when the chat UI streams an LLM answer. {core}

The browser sends the user's message to our backend, not to the model provider. The backend authenticates the user,
loads the conversation and the tools that user may use, and calls the model API with streaming on. As provider events
arrive, it translates them into our own events, such as `token`, `tool_call`, `step` and `done`, and forwards them to the
browser over SSE or a WebSocket. The UI appends tokens as they come.

The interesting parts are around that path. Tool calls are executed by the backend, with validation and permissions,
and their results go back to the model in another call, so one user turn can be several model calls. The backend
records usage and the final message when the stream completes. It handles failures mid-stream. And it cancels the
upstream call when the user presses stop or disconnects, so we stop paying for tokens nobody will read.

### How do the major LLM APIs stream, and what do you do with the events? {core}

They all use Server-Sent Events. OpenAI Chat Completions sends JSON chunks with a `delta` and ends with `[DONE]`. The
Responses API and Anthropic's Messages API send typed events: text deltas, tool-argument deltas, then a completion event
with the stop reason and usage. Gemini streams partial responses, using SSE when you ask for `alt=sse`.

Whichever provider it is, I accumulate the deltas: text is appended, but tool-call arguments are partial JSON and are
parsed only when the block is finished. I watch for error events after the `200`, record usage from the final event,
and translate everything into our own small event protocol before it goes to the browser.

### How would you design the event protocol between your backend and the chat UI? {core}

A small, versioned set of typed events, each with a sequence number and the run ID: `token` (text delta), `tool_call`
and `tool_result` (for showing agent activity), `step` (agent state changes such as planning, waiting for approval,
executing), `error` (with a code the UI can act on), and `done` (stop reason, usage). In TypeScript it is a
discriminated union, validated with zod at the edge.

The sequence numbers let the client detect gaps and resume with `Last-Event-ID` after a reconnect. Keeping provider
formats out of the UI means we can change models or add a second provider without touching the front end. It also
means the same protocol carries non-LLM events, such as a human approving a step.

### How does tool calling work? {core}

You send the model a list of tools, each with a name, a description and a JSON schema for the arguments. When it
decides a tool is needed, it returns a structured tool call instead of, or as well as, text. Your code validates the
arguments, checks permissions, runs the tool, and returns the result as a tool message tied to the call ID. The model
then continues. That loop, with a step limit, is the core of every agent.

The model only proposes; the application decides. Tool descriptions matter a lot because the model chooses tools from
them, and I generate the schema from the same Pydantic or zod model I validate with, so the two never drift.

### How do you get reliable structured output from a model? {core}

In layers. First, use the strongest mode the provider offers: schema-constrained output, or a forced tool call.
Second, always validate against a Pydantic or zod model anyway, because a schema guarantees shape, not correctness.
Third, if validation fails, send the specific errors back and let the model correct itself, with a small retry limit.
Fourth, if it still fails, route the item to a human instead of accepting bad data.

**Your angle:** this is exactly what you built at Quantiphi. Pydantic schemas enforced the data contract on extracted
document fields as the quality gate before human review.

### What happens to tool-call arguments when you stream? {deep}

They arrive as fragments of a JSON string spread over several events: `input_json_delta` events from Anthropic, or
`function_call_arguments.delta` events from OpenAI. A fragment such as `{"run_` is not valid JSON on its own, so you
buffer the fragments per tool call (keyed by content-block index or item ID) and parse once the block-stop or `.done`
event arrives. If the model makes several calls in one turn, you keep a buffer for each.

If you want to show the call in the UI while it forms, display the raw text, or use a tolerant partial-JSON parser
for display only. You never execute on partial arguments.

### How do you handle rate limits and transient errors from an LLM API? {core}

Classify first. Rate limits (`429`), overloads and `5xx` responses are retryable: I retry with exponential backoff and
jitter, honour `Retry-After` when the response has it, and cap the attempts and the total time. Bad requests and auth
failures are not retryable. Context-length errors need the request changed (trimmed history), not retried.

Above that sit per-tenant queues and rate limits on our side, so one noisy tenant cannot exhaust the shared quota, and a
fallback model or region for interactive traffic. Retries repeat the model call only. Tools that already ran are not
re-run, and write tools take idempotency keys.

### What can go wrong in the middle of a stream, and what do you do? {core}

The provider can send an error event after a `200`; the connection can drop; the user can press stop or close the tab;
the output can hit `max_tokens`; or a slow tool can stall the turn. For each I have a defined behaviour. On a provider
error, show what has arrived as partial, with a retry option. On a client disconnect, cancel the upstream request.
On `max_tokens`, mark the answer as truncated, or continue in a follow-up call. Stalls get timeouts.

The subtle one is the dropped connection between our backend and the browser. If the run continues server-side and
events are kept in a short replay buffer, the client can reconnect with `Last-Event-ID` and resume without paying for
the turn twice.

### How do you measure and reduce latency in an LLM feature? {core}

I measure time to first token, output tokens per second, and total time, per model and per step, because users feel
time to first token most. To reduce it: stream everything, use smaller models for routing and extraction, keep prompts
short and put the stable part first so it hits the provider's prompt cache, run independent tool calls in parallel,
avoid unnecessary agent loops, and keep the backend from buffering (no proxy buffering or compression on the stream).

I also show progress honestly: agent steps such as "searching" or "waiting for approval" make a 10-second run feel
responsive.

### How do you control LLM cost?

Track it per completed task and per tenant, from the usage the API returns. Then route easy steps to cheaper models,
cap `max_tokens`, keep tool results compact, trim or summarise history, cache shared prefixes, use batch APIs for
anything that is not interactive, and set budgets that stop a run, or ask a human, when it exceeds them. Loops and retries
are the usual leak, so step limits are a cost control as well as a safety control.

### What is prompt caching? {deep}

Providers can cache the processed form of a prompt prefix, so a later request that starts with the same prefix (system
prompt, tool definitions, a long document) skips reprocessing it. That gives lower time to first token and cheaper input
tokens. Some APIs do it automatically for long prompts; others need you to mark cache breakpoints. To benefit, put
stable content first and variable content last, and keep the prefix byte-for-byte identical, with no timestamps at the top.

### How do you manage long conversations and the context window?

History, tool definitions, retrieved documents and the answer all share the window, so I budget it: keep the system
prompt and tool definitions, keep the most recent turns, drop or summarise older ones, and keep large tool results out
of history by storing them and referencing them by ID. For long-running agents, durable state (what has been done,
what was approved) lives in a database or a graph checkpoint, not in the prompt. The trimming problem below is the
code version.

### How do you evaluate an LLM feature before shipping it? {core}

With a golden set of realistic cases and expected outcomes, run automatically in CI like a test suite. Where the result
is checkable by code (valid schema, right tool, right arguments, required fields present) I check it by code. Where it
is judgement (is the summary faithful, is the tone right) I use human review or an LLM judge that I have calibrated
against human labels. I add adversarial cases, such as injection attempts and missing data, and every production bug
becomes a new case.

I track pass rate, cost and latency for each prompt and model version, so a change is a measured trade-off rather than
a guess.

### How do you observe LLM calls in production?

A trace per run, with a span per model call and tool call: prompt and model version, token counts, latency, time to
first token, stop reason, cost, tool arguments and results, validation outcome, and the user or tenant. The trace ID
shows in the UI and the logs, so a support ticket leads straight to it. I put dashboards and alerts on error rate,
validation failures, retries, cost per task and latency percentiles, and redact secrets and personal data before
anything is stored.

### When would you route between models or fall back to another one? {deep}

Routing: send each request to the cheapest model that handles it well. A classifier or simple rules pick a small model
for extraction or short answers and a large one for planning. Fallback: when the primary model or region is rate
limited or down, retry interactive traffic on a secondary model or region instead of failing the user. The catch is that
prompts and tool behaviour differ between models, so each fallback path needs its own evaluation run. Silent quality
drops are worse than a clear error.

### Hosted APIs or self-hosted open models?

Hosted APIs give the best models, no infrastructure, and fast iteration, with enterprise data terms and regional
endpoints (Vertex AI on GCP). Self-hosting open-weight models gives control over data residency, cost at very high
volume, offline use and fine-tuning, but you own GPUs, scaling and upgrades. Most enterprise platforms use hosted models
through a gateway layer, with self-hosted models for narrow cases.

**Your angle:** your resume lists both the OpenAI API and Ollama with Qwen, so you can speak to a hosted API and a
locally run open model.

### How do you keep secrets and personal data safe when calling an LLM?

API keys stay in Secret Manager or are replaced by workload identity, and never reach the browser: the browser talks
only to our backend. Send the minimum data needed, redact or tokenise identifiers when the task allows, use providers
and endpoints with appropriate data-processing terms, keep personal data out of traces and long-term memory unless that
store is protected, and enforce the user's own permissions inside every tool, so the model can never see more than the
user could.

### Prompting, retrieval or fine-tuning: how do you choose?

Start with prompting and good tool design: it is cheapest to change. Add retrieval when the model needs knowledge it does
not have or that changes (policies, tickets, documents), with citations so answers are checkable. Fine-tune only when
you need a consistent format or style at scale, or a smaller model doing a narrow task as well as a big one, and you
have the data and the evaluation to prove it helped. For an agent platform, most quality comes from tools, retrieval and
validation, not from fine-tuning.

### What causes hallucinations, and how do you reduce them in an agent product?

The model generates plausible text, not verified facts, so it fills gaps confidently. In an agent product I reduce the
gaps: ground answers in tool results and retrieved documents, ask for citations to those sources, let the model say it
does not know, validate outputs against schemas and business rules, keep temperature low for factual steps, and require
human approval before any action. Evaluation sets measure the hallucination rate so changes can be compared.

### How do you call Gemini on Google Cloud, and how is auth different from using an API key? {core}

Through Vertex AI, which Google has folded into the Gemini Enterprise Agent Platform, using the `google-genai` SDK with
`vertexai=True` and the project and location, or through the REST `generateContent` and `streamGenerateContent`
methods. On Cloud Run or GKE the service authenticates as its own service account through Application Default
Credentials, and IAM roles decide what it may call. There is no API key to store, rotate or leak, and organisation
policies and VPC Service Controls apply. The Gemini Developer API with an API key is fine for prototypes, but an
enterprise platform on GCP would use the Vertex AI route, with the model ID kept in configuration because versions retire.

### Tell me about LLM work you have done. {core}

At Quantiphi I worked on a Document AI platform on GCP: a FastAPI backend took ML-extracted fields from documents, and
I designed the Pydantic schemas that validated that structured output as the quality gate before human review. Around it
we built agentic workflows with tool-use boundaries, validation loops and human-in-the-loop checkpoints, deployed on
Cloud Run. I've also worked with the OpenAI API and local models such as Qwen through Ollama, and I use Claude Code
every day for engineering work, reviewing every change it makes.

Then bridge to this role: "What I haven't done yet in production is stream tokens to a browser, which is why I built a
streaming demo with SSE and WebSockets." Say that only after you have built and run the
[streaming project](#/streaming-project).

## Coding problems

### Assemble streamed tool calls {medium core}

A provider streams events in this simplified form:

- `{"type": "tool_start", "index": i, "id": ..., "name": ...}` starts tool call `i`.
- `{"type": "args_delta", "index": i, "delta": "<partial JSON>"}` continues it. Deltas for different indexes may
  interleave.
- `{"type": "tool_end", "index": i}` finishes it.

Write `assemble(events)` that returns the finished calls, in the order they finished, as
`{"id", "name", "args"}` dicts with parsed arguments. If a call's JSON is invalid when it ends, return it with
`"error": "invalid_json"` and no `args`, instead of raising. An `args_delta` or `tool_end` for an unknown index raises
`ValueError`.

#### Hints

1. Keep a dict from index to an in-progress record holding the id, the name and a list of string fragments.
2. Never call `json.loads` on a delta: join the fragments only at `tool_end`.
3. Catch `json.JSONDecodeError` at `tool_end` and record the error on that call only.

#### Solution

The only real trap is parsing too early. Buffer per index, join at the end, parse once, and keep one bad call from
breaking the others. A list of fragments joined once avoids repeated string concatenation on long arguments.

```python
import json
from collections.abc import Iterable

def assemble(events: Iterable[dict]) -> list[dict]:
    pending: dict[int, dict] = {}
    done: list[dict] = []
    for ev in events:
        i = ev["index"]
        if ev["type"] == "tool_start":
            pending[i] = {"id": ev["id"], "name": ev["name"], "parts": []}
        elif ev["type"] == "args_delta":
            if i not in pending:
                raise ValueError(f"delta for unknown tool call {i}")
            pending[i]["parts"].append(ev["delta"])
        elif ev["type"] == "tool_end":
            if i not in pending:
                raise ValueError(f"end of unknown tool call {i}")
            call = pending.pop(i)
            raw = "".join(call["parts"]) or "{}"
            try:
                done.append({"id": call["id"], "name": call["name"], "args": json.loads(raw)})
            except json.JSONDecodeError:
                done.append({"id": call["id"], "name": call["name"], "error": "invalid_json"})
    return done

events = [
    {"type": "tool_start", "index": 0, "id": "c1", "name": "get_run"},
    {"type": "tool_start", "index": 1, "id": "c2", "name": "list_steps"},
    {"type": "args_delta", "index": 0, "delta": '{"run_id": '},
    {"type": "args_delta", "index": 1, "delta": '{"run_id": "r-7", '},
    {"type": "args_delta", "index": 0, "delta": '"r-7"}'},
    {"type": "tool_end", "index": 0},
    {"type": "args_delta", "index": 1, "delta": '"limit": 20}'},
    {"type": "tool_end", "index": 1},
]
assert assemble(events) == [
    {"id": "c1", "name": "get_run", "args": {"run_id": "r-7"}},
    {"id": "c2", "name": "list_steps", "args": {"run_id": "r-7", "limit": 20}},
]
# No arguments at all is a valid call with empty args.
assert assemble([{"type": "tool_start", "index": 0, "id": "c", "name": "ping"}, {"type": "tool_end", "index": 0}]) == [
    {"id": "c", "name": "ping", "args": {}}
]
# Truncated JSON is reported, not raised.
bad = [{"type": "tool_start", "index": 0, "id": "c", "name": "x"}, {"type": "args_delta", "index": 0, "delta": '{"a": '}, {"type": "tool_end", "index": 0}]
assert assemble(bad) == [{"id": "c", "name": "x", "error": "invalid_json"}]
for orphan in ({"type": "args_delta", "index": 3, "delta": "{}"}, {"type": "tool_end", "index": 3}):
    try:
        assemble([orphan])
    except ValueError:
        pass
    else:
        raise AssertionError("unknown index must raise")
```

Complexity: O(total characters) time and space; each call is joined and parsed once.

#### Follow-ups

- **How would you show the call in the UI while it streams?** Forward the raw fragments as display-only events, or use
  a tolerant partial-JSON parser for display; execute only on the parsed, validated result.
- **What next after assembling?** Validate the arguments against the tool's Pydantic model, check permissions, then run
  the tool or create a pending approval.

### Validate and repair structured output {medium core}

An LLM turns a free-text request ("order 3 laptops from V001234 for about 4,200 USD on cost centre ENG-42") into JSON.
Write `extract(llm, text, max_attempts=3)` that validates the reply with a Pydantic model `PurchaseDraft`
(`vendor_id` matching `V` plus six digits, `quantity` a positive integer, `amount` positive, `currency` one of USD, EUR
or GBP). On a validation failure, call the LLM again with the original prompt plus the specific errors. Return
`("ok", draft)` or, after `max_attempts` failures, `("needs_review", errors)`. Test with fake LLMs.

#### Hints

1. `Model.model_validate_json(text)` raises `ValidationError` for broken JSON as well as for bad fields.
2. Turn `err.errors()` into short lines such as `"vendor_id: String should match pattern …"`.
3. The loop is bounded: exactly `max_attempts` LLM calls at most, then hand the item to a human.

#### Solution

The model proposes, the schema decides, and the specific error messages give the model something concrete to fix.
Retrying without feedback at a low temperature tends to repeat the same mistake. The bound guarantees the workflow
ends, with the failures routed to a person.

```python
from collections.abc import Callable
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, Field, ValidationError

class PurchaseDraft(BaseModel):
    vendor_id: str = Field(pattern=r"^V\d{6}$")
    quantity: int = Field(gt=0)
    amount: Decimal = Field(gt=0)
    currency: Literal["USD", "EUR", "GBP"]

def feedback(err: ValidationError) -> list[str]:
    return [f"{'.'.join(map(str, e['loc'])) or 'reply'}: {e['msg']}" for e in err.errors()]

def extract(llm: Callable[[str], str], text: str, max_attempts: int = 3):
    prompt = f"Return JSON with vendor_id, quantity, amount, currency.\n<request>\n{text}\n</request>"
    errors: list[str] = []
    for _ in range(max_attempts):
        reply = llm(prompt if not errors else prompt + "\nYour last reply had these errors:\n" + "\n".join(errors))
        try:
            return "ok", PurchaseDraft.model_validate_json(reply)
        except ValidationError as err:
            errors = feedback(err)
    return "needs_review", errors

def scripted(*replies: str) -> Callable[[str], str]:
    queue = list(replies)
    prompts: list[str] = []
    def llm(prompt: str) -> str:
        prompts.append(prompt)
        return queue.pop(0)
    llm.prompts = prompts  # type: ignore[attr-defined]
    return llm

fixes = scripted(
    '{"vendor_id": "1234", "quantity": 3, "amount": "4200", "currency": "USD"}',
    '{"vendor_id": "V001234", "quantity": 3, "amount": "4200", "currency": "USD"}',
)
status, draft = extract(fixes, "order 3 laptops from V001234 for about 4,200 USD")
assert status == "ok" and draft.vendor_id == "V001234" and draft.amount == Decimal("4200")
assert "vendor_id: String should match pattern" in fixes.prompts[1]

never = scripted("not json", '{"vendor_id": "V001234"}', '{"vendor_id": "V001234", "quantity": 0, "amount": 1, "currency": "INR"}')
status, errors = extract(never, "something vague")
assert status == "needs_review"
assert {e.split(":")[0] for e in errors} == {"quantity", "currency"}
assert len(never.prompts) == 3
```

Complexity: at most `max_attempts` model calls; validation is linear in the reply size.

#### Follow-ups

- **What else would you check?** Business rules the schema cannot express: the vendor exists and is active, the amount
  is within the requester's approval limit, the cost centre belongs to their department.
- **What would you log?** Attempt counts and which fields failed, without the user's data, to find the weakest fields
  and improve the prompt.

### Retry an LLM call with backoff and Retry-After {medium}

Write `withRetry(call, opts)` in TypeScript. `call()` returns a promise of a result or throws an error with an optional
`status` and `retryAfterMs`. Retry only `429`, `500`, `502`, `503`, `504` and `529`, plus errors with no status
(network). Wait `retryAfterMs` when given, otherwise exponential backoff with full jitter: a random delay between 0 and
`min(maxDelay, base * 2^attempt)`. Stop after `maxAttempts` attempts and rethrow the last error. Make sleeping and
randomness injectable so the test runs instantly.

#### Hints

1. Loop over attempts; on success return; on failure decide "retryable?" first.
2. A `400` or `401` must fail immediately: retrying wastes quota and hides bugs.
3. Pass `sleep` and `random` in the options, so tests can record the delays instead of waiting.

#### Solution

Classify, then wait. Full jitter spreads retries from many clients so they do not hit the API at the same moment, and
`Retry-After` wins because the server knows best when capacity returns.

```ts
import assert from 'node:assert/strict';

type ApiError = Error & { status?: number; retryAfterMs?: number };
type Options = {
  maxAttempts: number;
  baseMs: number;
  maxDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);

export async function withRetry<T>(call: () => Promise<T>, opts: Options): Promise<T> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  if (opts.maxAttempts < 1) throw new RangeError('maxAttempts must be at least 1');
  let last: unknown;
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await call();
    } catch (err) {
      last = err;
      const { status, retryAfterMs } = err as ApiError;
      const retryable = status === undefined || RETRYABLE.has(status);
      if (!retryable || attempt === opts.maxAttempts - 1) break;
      const cap = Math.min(opts.maxDelayMs, opts.baseMs * 2 ** attempt);
      await sleep(retryAfterMs ?? Math.floor(random() * cap));
    }
  }
  throw last;
}

const fail = (status?: number, retryAfterMs?: number): ApiError => Object.assign(new Error(`status ${status}`), { status, retryAfterMs });

// 429 with Retry-After, then a network error, then success.
const delays: number[] = [];
const outcomes = [fail(429, 1500), fail(undefined), 'ok'];
let calls = 0;
const result = await withRetry(
  async () => {
    const next = outcomes[calls++];
    if (next instanceof Error) throw next;
    return next;
  },
  { maxAttempts: 5, baseMs: 200, maxDelayMs: 5000, sleep: async (ms) => void delays.push(ms), random: () => 0.5 },
);
assert.equal(result, 'ok');
assert.equal(calls, 3);
assert.deepEqual(delays, [1500, 200]); // Retry-After honoured, then jitter: 0.5 * min(5000, 200 * 2)

// A 400 is not retried.
let badCalls = 0;
await assert.rejects(
  withRetry(async () => { badCalls++; throw fail(400); }, { maxAttempts: 5, baseMs: 1, maxDelayMs: 1, sleep: async () => {} }),
  /status 400/,
);
assert.equal(badCalls, 1);

// Gives up after maxAttempts and rethrows the last error.
let busy = 0;
await assert.rejects(
  withRetry(async () => { busy++; throw fail(529); }, { maxAttempts: 3, baseMs: 1, maxDelayMs: 1, sleep: async () => {} }),
  /status 529/,
);
assert.equal(busy, 3);

// Zero attempts is a configuration error, not a silent `throw undefined`.
await assert.rejects(withRetry(async () => 'never', { maxAttempts: 0, baseMs: 1, maxDelayMs: 1 }), RangeError);
```

Complexity: at most `maxAttempts` calls; total wait is bounded by the sum of the capped delays.

#### Follow-ups

- **What about streaming calls?** Retry automatically only before the first token arrives. After that, the user has seen
  partial output, so surface the error with a retry action, or resume from a replay buffer.
- **How do you stop retries from making an outage worse?** A retry budget or circuit breaker: when most calls are
  failing, fail fast for a while instead of multiplying load.
- **What if `Retry-After` says 60 seconds?** For an interactive request, waiting that long is worse than failing: cap
  the wait (or the total deadline) and show a clear "busy, try again" state, or fall back to another model or region.

### Trim chat history to a token budget {easy}

Write `trim(messages, budget, count_tokens)` that keeps the system message (always first), then as many of the most
recent messages as fit in `budget` tokens in total, in their original order. Never split a tool result from the
assistant message that requested it: a `tool` message is kept only if the message before it is kept too. If even the
system message does not fit, raise `ValueError`.

#### Hints

1. Walk backwards from the newest message, adding while the running total fits.
2. Collect in reverse, then reverse at the end to restore the order.
3. After choosing, drop any leading `tool` message whose requesting assistant message was not kept.

#### Solution

Recent context matters most, and the system prompt is non-negotiable. The pairing rule matters because most APIs reject
a tool result whose tool call is missing from the history.

```python
from collections.abc import Callable

def trim(messages: list[dict], budget: int, count_tokens: Callable[[str], int]) -> list[dict]:
    system, rest = messages[0], messages[1:]
    used = count_tokens(system["content"])
    if used > budget:
        raise ValueError("system prompt alone exceeds the budget")
    kept: list[dict] = []
    for msg in reversed(rest):
        cost = count_tokens(msg["content"])
        if used + cost > budget:
            break
        kept.append(msg)
        used += cost
    kept.reverse()
    while kept and kept[0]["role"] == "tool":  # its tool call was trimmed away
        kept.pop(0)
    return [system, *kept]

words = lambda text: len(text.split())
history = [
    {"role": "system", "content": "You operate the run console"},          # 5
    {"role": "user", "content": "start run r-1"},                          # 3
    {"role": "assistant", "content": "calling start_run"},                 # 2
    {"role": "tool", "content": "run r-1 started"},                        # 3
    {"role": "user", "content": "status please"},                          # 2
    {"role": "assistant", "content": "r-1 is executing step two"},         # 5
]
assert [m["content"] for m in trim(history, 100, words)] == [m["content"] for m in history]
# Budget 12: system (5) + last two messages (7). The tool result is not reached.
assert [m["role"] for m in trim(history, 12, words)] == ["system", "user", "assistant"]
# Budget 15: the tool result (3) would fit, but its assistant call does not, so it is dropped.
assert [m["role"] for m in trim(history, 15, words)] == ["system", "user", "assistant"]
try:
    trim(history, 3, words)
except ValueError:
    pass
else:
    raise AssertionError("system prompt must fit")
```

Complexity: O(n) messages, one token count each.

#### Follow-ups

- **What instead of dropping old turns?** Summarise them into one message, and store large tool results outside the
  history, referenced by ID.
- **How do you count tokens accurately?** Use the provider's tokenizer or token-counting endpoint; word counts are only
  an estimate, so leave headroom for the answer.
