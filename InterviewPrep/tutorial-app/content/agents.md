---
title: Agents, tool calling and guardrails
goal: Explain how agents and tool calling work, choose between a workflow and an agent, and design the guardrails, validation loops and human checkpoints that make agentic AI safe in healthcare.
minutes: 45
---

"Agentic AI" is on almost every AI engineering job description now, and interviewers use it to separate people who
have wired a demo from people who have shipped something reliable. Expect "what is an agent?", "how does tool calling
work?", "how do you stop it doing something dangerous?" and "how do you evaluate it?".

This is home ground for you: you built agentic workflows with tool-use boundaries, validation loops and
human-in-the-loop checkpoints. The winning theme in every answer is **control**: the model proposes, code validates,
and humans approve anything risky.

## Workflows and agents

Not every LLM system should be an agent. A useful distinction:

- A **workflow** orchestrates LLM calls and tools through **code paths you define**. Predictable, testable, cheaper.
- An **agent** lets the **model decide** the next step in a loop: which tool to call, with what arguments, and when it
  is done. Flexible, but less predictable, slower and more expensive.

Start with the simplest thing that works, and add autonomy only where the task genuinely needs it. Common workflow
patterns:

| Pattern | What it does | Example |
|---|---|---|
| Prompt chaining | Fixed sequence of steps, each validated | Classify document → extract fields → validate → summarise |
| Routing | Classify the input, send it to a specialised prompt or model | Paystub vs MAGI form vs unknown → different extractors |
| Parallelisation | Run independent calls at once, or the same call several times and vote | Extract each section in parallel; majority vote on a label |
| Orchestrator–workers | One LLM plans sub-tasks, workers do them, results merged | Review a 200-page case file section by section |
| Evaluator–optimiser | One call generates, another critiques, loop until it passes | Draft an appeal letter, check against policy, revise |

## How tool calling works

The model never runs code. You describe tools (name, description, JSON schema for the arguments); the model replies
with a **request** to call one; **your code** validates and executes it and sends the result back; the loop continues
until the model gives a final answer.

```text
you ─► model: messages + tool definitions
model ─► you: tool_call(name="lookup_member", args={"member_id": "M123"})
you: validate args ─► check permission ─► execute ─► result
you ─► model: tool result (as data)
model ─► you: final answer (or another tool call)        ... repeat, with a step limit
```

Pydantic is a convenient way to define a tool's arguments once and generate the JSON schema from it, so the schema
you send and the validation you run can never drift apart.

```python
from pydantic import BaseModel, Field

class LookupClaim(BaseModel):
    """Look up the status of a claim by its claim number."""
    claim_id: str = Field(pattern=r"^CLM-\d{6}$", description="Claim number, e.g. CLM-004211")
    include_history: bool = False

tool_definition = {
    "name": "lookup_claim",
    "description": LookupClaim.__doc__,
    "parameters": LookupClaim.model_json_schema(),
}
schema = tool_definition["parameters"]
assert schema["required"] == ["claim_id"]
assert schema["properties"]["claim_id"]["pattern"] == r"^CLM-\d{6}$"

# The same model validates whatever arguments the LLM sends back.
args = LookupClaim.model_validate({"claim_id": "CLM-004211"})
assert args.include_history is False
```

## Guardrails: where control lives

Prompts are not a security boundary. Put the controls in code:

| Layer | Guardrail |
|---|---|
| Input | Redact or minimise PHI, length limits, wrap untrusted text (documents, emails, web pages) as data |
| Tools | Allow-list of tools per task, validated arguments, least-privilege credentials, read-only by default |
| Actions | Human approval for anything irreversible or external: submissions, payments, messages, record changes |
| Loop | Maximum steps, timeouts, token and cost budgets, loop detection (same call repeated) |
| Output | Schema validation, business rules, citation checks, confidence thresholds that route to a human |
| Operations | Full tracing, audit log of every tool call and approval, kill switch, evaluation suite in CI |

**Your angle:** your resume describes exactly this: agentic AI workflows with **tool-use boundaries**, **validation
loops** and **HITL checkpoints**, and on the Document AI platform a Pydantic validation gate before human review.

## Frameworks in one table

| Framework | Best at |
|---|---|
| LangChain | Large ecosystem of integrations: models, loaders, vector stores, tools |
| LangGraph | Stateful agents as explicit graphs: checkpoints, retries, human-in-the-loop interrupts, durable execution |
| LlamaIndex | Data and retrieval: ingestion, indexes, RAG pipelines, plus agent workflows |
| OpenAI Agents SDK | Lightweight agents with handoffs, guardrails, sessions and built-in tracing |
| MCP (Model Context Protocol) | Not a framework: an open protocol for connecting models to tools and data through MCP servers |

Frameworks speed up prototypes, but the important parts, validation, permissions and approval, are your code
either way. Many teams write the core loop themselves because it is short, as the coding problems below show.

## Interview questions

### What is an AI agent, and how is it different from a workflow? {core}

An agent is an LLM running in a loop that decides its own next step: it looks at the goal and what has happened so far,
chooses a tool and its arguments, sees the result, and repeats until it decides it is done. A workflow also uses LLMs
and tools, but the sequence of steps is defined in code.

I default to workflows because they are predictable, testable and cheaper, and use an agent only where the path really
cannot be known in advance, such as open-ended investigation across several systems. Even then I keep the agent inside
code-enforced limits: allowed tools, step and cost budgets, validation, and human approval for risky actions.

### How does tool calling work? {core}

You send the model a list of tools, each with a name, a description and a JSON schema for its arguments. When the model
decides a tool is needed, it returns a structured tool call instead of text. Your application validates the arguments,
checks permissions, runs the function, and sends the result back as a tool message; the model then continues or calls
another tool.

The key point is that the model only *proposes* calls; your code decides whether to execute them. Good tool
descriptions matter a lot, since the model picks tools from them, and the same Pydantic model can generate the schema
and validate the arguments.

### Explain the ReAct pattern. {core}

ReAct (reason plus act) interleaves reasoning and actions: the model thinks about what it needs, takes an action (a tool
call), observes the result, and repeats until it can answer. Grounding each step in real observations reduces
hallucination compared with reasoning alone, and the trace of thought, action and observation makes the agent's
behaviour inspectable. Modern tool-calling APIs implement this loop natively; you add the step limit, error handling
and stopping rules.

### What workflow patterns do you use before reaching for a full agent?

Prompt chaining (fixed steps with a check between each), routing (classify the input and send it to a specialised path),
parallelisation (independent sub-tasks at the same time, or several attempts and a vote), orchestrator–workers (one
model splits a big task and others do the parts), and evaluator–optimiser (generate, critique against criteria,
revise). Most production "agents" are really one of these patterns, which is good: each step can be validated and
tested on its own.

**Your angle:** document processing is a natural chain. On the LDH Medicaid platform, ML-extracted fields went through a
Pydantic validation gate before human-in-the-loop review, and only then on to submission: each step checkable on its own.

### How do agents plan? {deep}

Three common approaches. **Implicit** planning: a ReAct loop decides one step at a time, which is simple but can wander.
**Plan-and-execute**: the model first writes an explicit plan of steps, a cheaper executor runs them, and the planner
revises if a step fails. That is more efficient and easier to review, and a human can approve the plan. **Reflection**:
after an attempt the model critiques its own result and retries. For high-stakes work I like plan-and-execute with
the plan shown for approval, because humans review a plan faster than a sequence of raw actions.

### How do you give an agent memory?

**Short-term memory** is the conversation and tool results in the context window, managed by trimming and summarising
old turns. **Long-term memory** is stored outside the model, in a database or vector store, and retrieved when relevant:
user preferences, past cases, facts learned earlier. **State** for a workflow (which step, what was approved) belongs
in a durable store, such as LangGraph checkpoints or your own database, so a run can resume after a crash or a
long human review. With PHI, memory is regulated data: apply access control, retention limits and audit, and never let
one user's memory leak into another's session.

### When is a multi-agent system worth it? {deep}

When a task splits into parts that need genuinely different tools, instructions or permissions, or can run in parallel:
for example a researcher agent with read-only search tools and a separate drafting agent. Separation also gives you
least privilege per agent. The costs are real: more tokens, more latency, more failure points and much harder
debugging, because errors compound across hand-offs. I start with one agent or a workflow and split only when
evaluation shows a single agent cannot handle the scope.

### LangChain, LangGraph, LlamaIndex or the OpenAI Agents SDK: how do you choose?

LangChain for its integrations when you need many connectors quickly; LangGraph when the agent has real state and
control flow (branches, retries, checkpoints, human approval interrupts), because the graph makes behaviour explicit;
LlamaIndex when the problem is mostly data ingestion and retrieval; the OpenAI Agents SDK for a lightweight agent with
hand-offs, guardrails and tracing.

My honest view: the core loop is short, so for a narrow production workflow I am also comfortable writing it directly
with Pydantic validation, which keeps it transparent and easy to audit. I choose a framework for the problems it
solves, not by default.

### What is MCP? {core}

The Model Context Protocol is an open standard, introduced by Anthropic in late 2024 and adopted widely since, for
connecting AI applications to tools and data. An **MCP server** exposes tools, resources and prompts in a standard way;
any MCP-capable client (an IDE assistant, a chat app, your own agent) can use them. It is like a USB port for tools:
write the integration once instead of once per framework.

Security still matters: an MCP server runs with whatever permissions you give it, so apply least privilege, authenticate
it, and treat third-party servers and their tool outputs as untrusted.

### What guardrails do you put around an agent? {core}

Defence in depth, enforced in code rather than in the prompt: an allow-list of tools for the task; argument
validation with schemas; least-privilege credentials, read-only unless writing is required; human approval for
irreversible or external actions; step, time, token and cost limits; output validation against schemas and business
rules; PHI minimisation and redaction; full tracing and an audit log; and an evaluation suite that runs on every
change.

**Your angle:** you built agentic workflows with tool-use boundaries, validation loops and HITL checkpoints. Name those
three, then explain why each exists.

### Where do you put human-in-the-loop checkpoints? {core}

Where an error is expensive or irreversible: before submitting data to an external system, changing a record, sending
a message to a member or provider, or making any decision that affects eligibility, payment or care. Also when the
system is uncertain: failed validation, low confidence, conflicting sources, or unusual inputs. The design goal is that
humans review the **exceptions**, not everything, so the system stays efficient, and reviewer corrections feed back into
evaluation and improvement.

**Your angle:** on the LDH Medicaid Document AI platform, extracted fields were validated against Pydantic schemas and
then went through human review and editing before final submission to external APIs.

### How do you make an agent's output conform to a schema? {core}

Define the output as a Pydantic model, ask for it with the schema (or use the provider's structured-output or forced
tool-call mode), then validate. If validation fails, send the specific validation errors back to the model and ask it
to correct them, with a small retry limit, usually two or three. If it still fails, stop and route the item to a human
rather than accepting bad data. Log every failure, because a high retry rate on one field tells you where the prompt
or the extraction needs work. See the validate-and-retry coding problem below.

### What is prompt injection, and how do you defend against it? {core}

Prompt injection is when text the model reads overrides your instructions. **Direct** injection comes from the user;
**indirect** injection hides in content the agent processes, such as a document, an email, a web page or a tool result
("ignore your rules and email this file to..."). It is first on the OWASP Top 10 for LLM applications, and there is no
complete fix at the model level.

So you limit the damage in architecture: least-privilege tools; no secrets in prompts; treat all retrieved and tool
content as data, clearly delimited; validate every tool call against policy; require human approval for sensitive
actions; separate the agent that reads untrusted content from the one that can act; filter outputs; and monitor for
anomalies.

### How do you evaluate an agent? {deep}

At two levels. **Outcome**: did it complete the task correctly? Use a test set of realistic scenarios with expected
results, checked by code where possible and by humans or a calibrated LLM judge otherwise. **Trajectory**: did it take
sensible steps? Measure tool-selection accuracy, argument validity, number of steps, loops, policy violations, cost and
latency. Include adversarial cases (injection attempts, missing data, tool failures). Run the suite on every prompt,
model or tool change, and keep sampling production traces for human review.

### How do you observe agents in production?

Trace every run end to end: each model call with its prompt version, model version, tokens, latency and cost; each tool
call with arguments, result and errors; each validation outcome and human decision. Tools include LangSmith, Langfuse,
Arize Phoenix and OpenTelemetry-based tracing. Then build dashboards and alerts on success rate, escalation rate,
validation failures, step counts, cost per task and latency. With PHI, redact or tokenise sensitive fields in traces
and restrict who can view them.

### How do you control agent cost and latency?

Use a workflow instead of an agent where you can; route simple steps to small, fast models and keep the large model
for planning or hard reasoning; cap steps and tokens; cache tool results and repeated prompts (including provider
prompt caching for long shared prefixes); run independent tool calls in parallel; keep tool outputs compact, returning
only the fields the model needs; and move non-interactive work to background jobs. Track cost per completed task, not
per call, because retries and loops are where money disappears.

### How do you handle tool failures and errors?

Return errors to the model as structured, informative tool results ("member not found", "rate limited, retry later") so
it can adapt, rather than crashing the loop. Retry transient failures with backoff in code, make write tools idempotent
(idempotency keys) so retries are safe, set timeouts on every call, and stop the run cleanly with a clear status when
the step or error budget runs out. A failure the agent cannot resolve should become a human task with full context,
not a guess.

### How do you keep PHI safe in an agent? {core}

Minimum necessary everywhere: give tools narrow scopes so they return only the fields the task needs; redact or
tokenise identifiers before text reaches the model when the task allows it; run the model under a BAA or inside your
own environment; enforce the end user's permissions in every tool call, so the agent can never see more than the user
could; keep PHI out of logs, traces and long-term memory unless that store is itself protected; and audit every access.
Also guard against exfiltration: no tools that can send data to arbitrary destinations, and human approval for any
outbound communication.

### What makes a good tool for an agent?

A clear name and a description that says when to use it and when not to; a narrow purpose (`get_claim_status` rather
than `run_sql`); a strict argument schema with formats and enums; compact, structured results; informative errors;
idempotent writes; and permissions enforced inside the tool, not trusted from the model. Fewer, well-designed tools
beat many overlapping ones, because tool choice gets less accurate as the list grows.

### Tell me about an agentic workflow you built. {core}

Structure the story: the goal, the steps and tools, the boundaries, the validation loop, the human checkpoint, and the
outcome. Using your resume: at Quantiphi you built agentic AI workflows with tool-use boundaries, validation loops and
HITL checkpoints. On the LDH Medicaid Document AI platform, ML-extracted fields were validated against Pydantic schemas
as the quality gate before human review, reviewers checked and corrected them, and the data then went to external APIs
for final submission. Close with what you would add next, for example an evaluation set built from reviewer corrections.

Use only details you can defend under follow-up questions, and do not quote metrics you cannot back up.

## Coding problems

### Implement a minimal agent loop with a step limit {medium core}

Write `run_agent(model, tools, goal, max_steps)`. `model(messages)` returns either `{"tool": name, "args": {...}}` or
`{"final": answer}`. Execute requested tools from the `tools` dict, append each result to the messages as
`{"role": "tool", "name": ..., "content": ...}`, and return the final answer. Handle an unknown tool or an exception by
returning an error message to the model instead of crashing. If `max_steps` is reached, return
`"stopped: step limit reached"`. Test it with a scripted fake model.

#### Hints

1. Keep a `messages` list starting with the user goal; loop at most `max_steps` times.
2. Each iteration: ask the model, return if it gave a final answer, otherwise look up and run the tool.
3. Wrap the tool call in `try/except` and report errors as tool results so the model can recover.

#### Solution

The loop is short; the value is in the control: a hard step limit, only allow-listed tools, and errors fed back as data.
A scripted fake model makes the loop testable without any API.

```python
from typing import Any, Callable

def run_agent(model: Callable[[list[dict]], dict], tools: dict[str, Callable[..., Any]], goal: str, max_steps: int = 5) -> str:
    messages: list[dict] = [{"role": "user", "content": goal}]
    for _ in range(max_steps):
        decision = model(messages)
        if "final" in decision:
            return decision["final"]
        name, args = decision.get("tool"), decision.get("args", {})
        if name not in tools:
            result = f"error: unknown tool {name!r}; allowed: {sorted(tools)}"
        else:
            try:
                result = str(tools[name](**args))
            except Exception as exc:  # report, do not crash the loop
                result = f"error: {type(exc).__name__}: {exc}"
        messages.append({"role": "tool", "name": name, "content": result})
    return "stopped: step limit reached"

def scripted(*steps: dict) -> Callable[[list[dict]], dict]:
    """A fake model that returns pre-written decisions and records what it saw."""
    queue = list(steps)
    def model(messages: list[dict]) -> dict:
        model.seen = [m["content"] for m in messages]
        return queue.pop(0)
    return model

CLAIMS = {"CLM-1": "denied: missing prior authorization"}
tools = {"claim_status": lambda claim_id: CLAIMS[claim_id]}

ok = scripted({"tool": "claim_status", "args": {"claim_id": "CLM-1"}}, {"final": "Denied for missing prior auth."})
assert run_agent(ok, tools, "Why was CLM-1 denied?") == "Denied for missing prior auth."
assert ok.seen[-1] == "denied: missing prior authorization"

recovers = scripted(
    {"tool": "delete_claim", "args": {"claim_id": "CLM-1"}},  # not allow-listed
    {"tool": "claim_status", "args": {"claim_id": "CLM-9"}},  # raises KeyError
    {"final": "I could not find that claim."},
)
assert run_agent(recovers, tools, "Check CLM-9") == "I could not find that claim."
assert recovers.seen[1].startswith("error: unknown tool 'delete_claim'")
assert recovers.seen[2].startswith("error: KeyError")

looping = scripted(*[{"tool": "claim_status", "args": {"claim_id": "CLM-1"}}] * 10)
assert run_agent(looping, tools, "loop forever", max_steps=3) == "stopped: step limit reached"
```

Complexity: O(max_steps) model and tool calls; memory grows with the message history.

#### Follow-ups

- **How would you validate tool arguments?** Give each tool a Pydantic model and call `model_validate(args)` before
  executing; return the validation errors to the model.
- **How do you detect loops early?** Track `(tool, args)` pairs and stop or warn when the same call repeats.
- **What changes for a real API?** The model call becomes a chat request with tool definitions, and tool results go back
  as tool messages tied to the call ID. The control logic stays the same.

### Validate and retry structured output {medium core}

An LLM extracts fields from a document as JSON. Write `extract_with_retry(llm, document, max_attempts)` that validates
the output with a Pydantic model, and on failure calls the LLM again with the validation errors included in the prompt.
Return `("ok", record)` on success or `("needs_review", errors)` after `max_attempts` failures, so the document goes to
a human. Test it with fake LLMs.

#### Hints

1. `Model.model_validate_json(text)` raises `ValidationError` for bad JSON and for invalid fields.
2. `ValidationError.errors()` gives a list of dicts with `loc` and `msg`: turn them into short feedback lines.
3. Build the retry prompt from the original prompt plus the feedback; keep the attempt count bounded.

#### Solution

This is the validation loop pattern: the model proposes, the schema decides, specific feedback lets the model fix its own
mistakes, and a hard limit hands the case to a human instead of looping or accepting bad data.

```python
from datetime import date
from typing import Callable
from pydantic import BaseModel, Field, ValidationError

class IncomeRecord(BaseModel):
    applicant_name: str = Field(min_length=1)
    pay_date: date
    gross_pay: float = Field(gt=0)

def feedback(err: ValidationError) -> list[str]:
    return [f"{'.'.join(map(str, e['loc'])) or 'document'}: {e['msg']}" for e in err.errors()]

def extract_with_retry(llm: Callable[[str], str], document: str, max_attempts: int = 3):
    prompt = f"Extract applicant_name, pay_date (YYYY-MM-DD) and gross_pay as JSON.\n<document>\n{document}\n</document>"
    errors: list[str] = []
    for _ in range(max_attempts):
        reply = llm(prompt if not errors else prompt + "\nFix these errors:\n" + "\n".join(errors))
        try:
            return "ok", IncomeRecord.model_validate_json(reply)
        except ValidationError as err:
            errors = feedback(err)
    return "needs_review", errors

def fake_llm(*replies: str) -> Callable[[str], str]:
    queue = list(replies)
    def llm(prompt: str) -> str:
        llm.prompts.append(prompt)
        return queue.pop(0)
    llm.prompts = []
    return llm

fixes_itself = fake_llm(
    '{"applicant_name": "Jane Roe", "pay_date": "09/30/2026", "gross_pay": 2450.75}',
    '{"applicant_name": "Jane Roe", "pay_date": "2026-09-30", "gross_pay": 2450.75}',
)
status, record = extract_with_retry(fixes_itself, "paystub text ...")
assert status == "ok" and record.pay_date == date(2026, 9, 30)
assert "Fix these errors:\npay_date" in fixes_itself.prompts[1]  # the retry prompt named the bad field

never_valid = fake_llm("not json", '{"applicant_name": ""}', '{"gross_pay": -1}')
status, errors = extract_with_retry(never_valid, "blurry scan ...")
assert status == "needs_review"
assert any(e.startswith("gross_pay") for e in errors)
assert len(never_valid.prompts) == 3  # bounded: exactly max_attempts calls
```

Complexity: at most `max_attempts` LLM calls; validation is linear in the size of the output.

#### Follow-ups

- **Why not just retry without feedback?** At temperature 0 the same prompt tends to give the same mistake; the error
  messages give the model something specific to correct.
- **What else would you validate?** Business rules beyond types: pay date not in the future, gross pay above net pay,
  name matching the application, cross-document consistency.
- **What do you log?** Attempt counts and the fields that failed, without PHI values, to find the weakest fields.

### Add an approval gate for side-effecting tools {easy}

Some tools only read data; others change the world (submit a claim, send a message). Write a class `ToolRunner` that
runs read-only tools immediately but, for tools marked as side-effecting, records a **pending action** and returns
`"pending approval: <id>"` instead of running. `approve(id)` runs the stored action and returns its result; `reject(id)`
discards it. Approving an unknown or already-handled ID raises `KeyError`.

#### Hints

1. Store each tool with a flag: `{"name": (function, needs_approval)}`.
2. Keep pending actions in a dict keyed by an incrementing ID, holding the tool name and arguments.
3. `dict.pop(id)` both fetches and removes, so an action can never run twice.

#### Solution

The model can propose anything; the runner decides what executes. Read-only calls flow freely, and anything with side
effects waits for a human. Popping the pending action makes approval idempotent: the same ID cannot run twice.

```python
from itertools import count
from typing import Any, Callable

class ToolRunner:
    def __init__(self, tools: dict[str, tuple[Callable[..., Any], bool]]):
        self.tools = tools
        self.pending: dict[int, tuple[str, dict]] = {}
        self._ids = count(1)

    def call(self, name: str, **args: Any) -> Any:
        fn, needs_approval = self.tools[name]
        if not needs_approval:
            return fn(**args)
        action_id = next(self._ids)
        self.pending[action_id] = (name, args)
        return f"pending approval: {action_id}"

    def approve(self, action_id: int) -> Any:
        name, args = self.pending.pop(action_id)  # KeyError if unknown or already handled
        return self.tools[name][0](**args)

    def reject(self, action_id: int) -> None:
        del self.pending[action_id]

submitted: list[str] = []
runner = ToolRunner({
    "get_status": (lambda claim_id: f"{claim_id}: in review", False),
    "submit_appeal": (lambda claim_id: submitted.append(claim_id) or f"appeal filed for {claim_id}", True),
})

assert runner.call("get_status", claim_id="CLM-1") == "CLM-1: in review"
assert runner.call("submit_appeal", claim_id="CLM-1") == "pending approval: 1"
assert submitted == []  # nothing happened yet
assert runner.approve(1) == "appeal filed for CLM-1" and submitted == ["CLM-1"]

assert runner.call("submit_appeal", claim_id="CLM-2") == "pending approval: 2"
runner.reject(2)
for bad in (1, 2, 99):  # already approved, rejected, unknown
    try:
        runner.approve(bad)
    except KeyError:
        pass
    else:
        raise AssertionError(f"approve({bad}) should fail")
assert submitted == ["CLM-1"]
```

Complexity: O(1) per call, approval and rejection.

#### Follow-ups

- **What would you store with a pending action in production?** Who requested it, the agent's reasoning, the exact
  arguments, a diff of what will change, an expiry time, and who approved it: the audit trail.
- **How does the agent continue after approval?** Persist the run state, for example as a LangGraph checkpoint or a
  database row, and resume the loop with the approval result as the tool output.
