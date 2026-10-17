---
title: Agents, tool use and agent frameworks
goal: Explain how agents work and when to use one, design the guardrails, validation loops and human checkpoints that make them safe, and build and defend a LangGraph workflow with state, checkpoints, approval and streaming.
minutes: 85
---

Agentic AI appears in most AI engineering roles now, and interviewers use it to separate people who have wired a demo
from people who have shipped something reliable. Expect "what is an agent?", "how does the agent loop work?", "how do you
stop it doing something dangerous?", "how would you build this in LangGraph?", "how do you pause for a human and resume
later?", "how do you stream its progress to the UI?" and "how do you evaluate it?".

Be precise about where you stand: your resume shows **agentic AI workflows you built** at Quantiphi, with tool-use
boundaries, validation loops and human-in-the-loop checkpoints, and no LangChain or LangGraph. That is a strong position
if you frame it well: those are the same ideas LangGraph formalises as state, steps, checkpoints and interrupts. The
winning theme in every answer is **control**: the model proposes, code validates, and humans approve anything risky.
Every LangGraph example in this chapter was run against **langgraph 1.2**; run them yourself and you can talk about the
current API with confidence.

## Workflows, agents and the loop

Not every LLM system should be an agent. A **workflow** runs LLM calls and tools along code paths you define:
predictable, testable and cheaper. An **agent** lets the model choose the next step in a loop (which tool, with what
arguments, and when it is done): flexible, but less predictable, slower and more expensive. Most production "agents" are
workflows with a few model-driven decisions, and that is a good thing: every step can be validated and tested. Start
with the simplest thing that works and add autonomy only where the task genuinely needs it.

| Pattern | Shape | Example |
|---|---|---|
| Prompt chaining | Fixed steps with a check between each | Classify document → extract fields → validate → summarise |
| Routing | Classify, then send to a specialised path | Paystub vs application form → different extractors; billing question vs incident |
| Parallelisation (map-reduce) | Independent sub-tasks at once, then merge, or several attempts and a vote | Check 30 invoices against the purchase order in parallel |
| Orchestrator–workers | One model plans sub-tasks, workers do them, results merged | Review a 200-page case file section by section |
| Evaluator–optimiser | Generate, critique against criteria, revise | Draft an appeal letter, check it against policy, revise |
| Agent (ReAct loop) | Model picks tools until done | Investigate a failed pipeline across logs, tickets and metrics |

The **agent loop** (ReAct, "reason and act"): the model looks at the goal and what has happened, proposes a tool call,
your code validates and runs it, the result goes back, and it repeats until the model answers or a limit is hit. The model
never runs code; it only proposes calls. How tool calling works on the wire, and how to generate tool schemas from
Pydantic, is in [LLMs and LLM APIs](#/llm-apps).

```text
you ─► model: messages + tool definitions
model ─► you: tool_call(name="get_run", args={"run_id": "r-42"})
you: validate args ─► check permission ─► execute ─► result
you ─► model: tool result (as data)
model ─► you: final answer (or another tool call)        ... repeat, with a step limit
```

## Guardrails: where control lives

Prompts are not a security boundary. Put the controls in code:

| Layer | Guardrail |
|---|---|
| Input | Minimise or redact sensitive data, length limits, wrap untrusted text (documents, emails, web pages, tool results) as data |
| Tools | Allow-list of tools per task, validated arguments (Pydantic, zod), least-privilege credentials, read-only by default, idempotent writes |
| Actions | Human approval for anything irreversible or external: submissions, payments, messages, record changes |
| Loop | Maximum steps, timeouts, token and cost budgets, loop detection (the same call repeated) |
| State | Durable state, so a run survives a crash, a deploy or a two-day wait for approval |
| Output | Schema validation, business rules, citation checks, confidence thresholds that route to a human |
| Operations | Full tracing, an audit log of every tool call and approval, a kill switch, an evaluation suite in CI |

**Your angle:** your resume describes exactly this: agentic AI workflows with **tool-use boundaries**, **validation
loops** and **HITL checkpoints**, and on the Document AI platform a Pydantic validation gate before human review.

## LangChain in five minutes

LangChain is the integration layer: a common interface over chat models from many providers, messages, tools, output
parsers and retrievers, composed as **runnables** that share `invoke`, `batch` and `stream`. Since LangChain 1.0, its
agent constructor (`create_agent` in `langchain.agents`) is built on LangGraph, and LangGraph's older prebuilt
`create_react_agent` is deprecated in favour of it.

```python
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableLambda
from langchain_core.tools import tool
from langchain_core.utils.function_calling import convert_to_openai_tool

@tool
def get_run_status(run_id: str) -> str:
    """Return the status of an agent run by its ID."""
    return f"{run_id}: succeeded"

# The decorator turns the signature and docstring into a tool schema.
spec = convert_to_openai_tool(get_run_status)["function"]
assert spec["name"] == "get_run_status"
assert spec["description"] == "Return the status of an agent run by its ID."
assert spec["parameters"]["required"] == ["run_id"]
assert get_run_status.invoke({"run_id": "r-1"}) == "r-1: succeeded"

# Runnables compose with | and all share invoke, batch and stream.
normalise = RunnableLambda(str.strip) | RunnableLambda(str.lower)
assert normalise.invoke("  R-42 ") == "r-42"
assert normalise.batch([" A", "B "]) == ["a", "b"]

# A fake chat model streams chunks like a real one: ideal for tests without an API key.
model = GenericFakeChatModel(messages=iter([AIMessage(content="Run r-1 succeeded")]))
chunks = [c.content for c in model.stream([HumanMessage("status?")])]
assert "".join(chunks) == "Run r-1 succeeded" and len(chunks) > 1
```

Use LangChain for its integrations (switching providers, loading documents, vector stores). Use LangGraph when you need
control over the flow.

## LangGraph: state, nodes and edges

LangGraph models a workflow as a graph over a **shared state**:

- **State** is a typed schema (a `TypedDict`, dataclass or Pydantic model). Each node receives the state and returns a
  **partial update**, never the whole state.
- **Reducers** decide how an update combines with the current value. By default it overwrites; with
  `Annotated[list[str], operator.add]` updates are appended; `add_messages` appends chat messages and replaces a message
  that has the same ID.
- **Nodes** are plain functions (sync or async). **Edges** are fixed transitions; **conditional edges** call a routing
  function that returns the next node's name or `END`.
- `compile()` turns the builder into a runnable app with `invoke`, `stream` and their async versions.
- Execution runs in **super-steps**: all nodes scheduled for a step run (in parallel if there are several), their updates
  are applied through the reducers, then the next step is planned.

```python
import operator
from typing import Annotated, Literal, TypedDict
from langgraph.graph import END, START, StateGraph

class TriageState(TypedDict):
    request: str
    category: str
    reply: str
    log: Annotated[list[str], operator.add]   # reducer: updates are appended, not overwritten

def classify(state: TriageState) -> dict:
    text = state["request"].lower()
    category = "purchase" if "order" in text or "buy" in text else "incident" if "down" in text else "question"
    return {"category": category, "log": [f"classified as {category}"]}

def route(state: TriageState) -> Literal["purchase", "incident", "answer"]:
    return state["category"] if state["category"] in ("purchase", "incident") else "answer"

def purchase(state: TriageState) -> dict:
    return {"reply": "Drafted a purchase request for approval.", "log": ["drafted purchase request"]}

def incident(state: TriageState) -> dict:
    return {"reply": "Opened an incident and paged on-call.", "log": ["opened incident"]}

def answer(state: TriageState) -> dict:
    return {"reply": "Here is what I found.", "log": ["answered"]}

builder = StateGraph(TriageState)
for name, fn in [("classify", classify), ("purchase", purchase), ("incident", incident), ("answer", answer)]:
    builder.add_node(name, fn)
builder.add_edge(START, "classify")
builder.add_conditional_edges("classify", route)
for leaf in ("purchase", "incident", "answer"):
    builder.add_edge(leaf, END)
app = builder.compile()

out = app.invoke({"request": "Please order 3 laptops", "log": []})
assert out["category"] == "purchase"
assert out["log"] == ["classified as purchase", "drafted purchase request"]
assert app.invoke({"request": "The ERP sync is down", "log": []})["reply"].startswith("Opened an incident")
```

## A tool-calling agent in LangGraph

The classic agent graph has two nodes: the **agent** node calls the model, and the **tools** node runs whatever tool
calls the model made. `tools_condition` routes to the tools node when the last AI message contains tool calls and to
`END` otherwise. `MessagesState` is a ready-made state with a `messages` list using the `add_messages` reducer. The fake
model below returns a scripted tool call, then a final answer, so the whole loop runs without an API.

```python
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

@tool
def get_run_status(run_id: str) -> str:
    """Return the status of an agent run by its ID."""
    return {"r-1": "succeeded", "r-2": "failed at step 3"}.get(run_id, "unknown run")

model = GenericFakeChatModel(messages=iter([
    AIMessage(content="", tool_calls=[{"name": "get_run_status", "args": {"run_id": "r-2"}, "id": "call_1"}]),
    AIMessage(content="Run r-2 failed at step 3."),
]))

def agent(state: MessagesState) -> dict:
    # With a real model: model.bind_tools([get_run_status]).invoke(state["messages"])
    return {"messages": [model.invoke(state["messages"])]}

builder = StateGraph(MessagesState)
builder.add_node("agent", agent)
builder.add_node("tools", ToolNode([get_run_status]))
builder.add_edge(START, "agent")
builder.add_conditional_edges("agent", tools_condition)   # tool calls → "tools", otherwise END
builder.add_edge("tools", "agent")
app = builder.compile()

messages = app.invoke({"messages": [HumanMessage("Why did r-2 fail?")]})["messages"]
assert [type(m).__name__ for m in messages] == ["HumanMessage", "AIMessage", "ToolMessage", "AIMessage"]
assert isinstance(messages[2], ToolMessage) and messages[2].tool_call_id == "call_1"
assert messages[2].content == "failed at step 3"
assert messages[-1].content == "Run r-2 failed at step 3."
```

## Persistence and human-in-the-loop

Compile with a **checkpointer** and LangGraph saves the state after every super-step, keyed by a `thread_id` you pass
in the config. That gives you three things an agent product needs:

- **Pause and resume.** Inside a node, `interrupt(payload)` stops the run and surfaces the payload (for example, the
  action awaiting approval). Days later, `invoke(Command(resume=value), config)` continues: the node runs again **from
  its start**, and this time `interrupt` returns the value.
- **Crash recovery.** A run resumes from its last checkpoint after a restart or a deploy.
- **Inspection and time travel.** `get_state` shows the current values and the next node; `get_state_history` lists
  every checkpoint; you can replay from one, or `update_state` to fork a corrected branch.

`InMemorySaver` is for tests. In production you use a durable saver, such as the Postgres checkpointer
(`langgraph-checkpoint-postgres`), on Cloud SQL. The `durability` option controls when checkpoints are written: `"async"`
(the default), `"sync"` (before the next step starts) or `"exit"` (only at the end).

```python
import operator
from typing import Annotated, Literal, TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

class RunState(TypedDict):
    request: str
    action: dict
    approved: bool
    result: str
    log: Annotated[list[str], operator.add]

def plan(state: RunState) -> dict:
    return {"action": {"tool": "create_po", "vendor": "V001234", "amount": 4200}, "log": ["planned"]}

def approval(state: RunState) -> dict:
    # Everything before interrupt() re-runs on resume, so keep side effects out of this node.
    decision = interrupt({"question": "Approve this action?", "action": state["action"]})
    return {"approved": decision == "approve", "log": [f"human said {decision}"]}

def after_approval(state: RunState) -> Literal["execute", "__end__"]:
    return "execute" if state["approved"] else END

def execute(state: RunState) -> dict:
    return {"result": "PO-1001 created", "log": ["executed"]}

builder = StateGraph(RunState)
builder.add_node("plan", plan)
builder.add_node("approval", approval)
builder.add_node("execute", execute)
builder.add_edge(START, "plan")
builder.add_edge("plan", "approval")
builder.add_conditional_edges("approval", after_approval)
builder.add_edge("execute", END)
app = builder.compile(checkpointer=InMemorySaver())

config = {"configurable": {"thread_id": "run-42"}}
first = app.invoke({"request": "order laptops", "log": []}, config)
assert first["__interrupt__"][0].value["action"]["tool"] == "create_po"   # paused, waiting for a human
assert app.get_state(config).next == ("approval",)

final = app.invoke(Command(resume="approve"), config)                       # later, maybe from another process
assert final["result"] == "PO-1001 created"
assert final["log"] == ["planned", "human said approve", "executed"]

# Every super-step was checkpointed; history is newest first.
history = list(app.get_state_history(config))
assert history[0].values["result"] == "PO-1001 created" and history[0].next == ()

# A second thread is independent, and rejecting ends the run without executing.
other = {"configurable": {"thread_id": "run-43"}}
app.invoke({"request": "order chairs", "log": []}, other)
assert "result" not in app.invoke(Command(resume="reject"), other)
```

## Streaming a run to the UI

`stream()` yields events while the graph runs, in one or more **stream modes**:

| Mode | Yields | Use in the UI |
|---|---|---|
| `values` | The full state after each step | Simple state viewers; heavy for big states |
| `updates` | `{node_name: update}` after each node | Step-by-step progress ("planned", "waiting for approval") |
| `messages` | `(message_chunk, metadata)` as LLM tokens arrive, with the node name | Token streaming in the chat |
| `custom` | Whatever a node writes with `get_stream_writer()` | Progress bars, tool sub-steps |
| `debug` / `tasks` / `checkpoints` | Detailed execution events | Developer tooling |

Pass a list (`stream_mode=["updates", "messages"]`) to get `(mode, payload)` pairs. An interrupt appears in the
`updates` stream as an `__interrupt__` entry. The backend's job is to translate these into its own SSE or WebSocket
events (see the coding problem below and the [streaming project](#/streaming-project)).

```python
from typing import TypedDict
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph

class CheckState(TypedDict):
    invoices: list[str]
    checked: int

def check_invoices(state: CheckState) -> dict:
    write = get_stream_writer()
    for i, invoice in enumerate(state["invoices"], start=1):
        write({"progress": i, "of": len(state["invoices"]), "invoice": invoice})
    return {"checked": len(state["invoices"])}

builder = StateGraph(CheckState)
builder.add_node("check_invoices", check_invoices)
builder.add_edge(START, "check_invoices")
builder.add_edge("check_invoices", END)
app = builder.compile()

events = list(app.stream({"invoices": ["INV-1", "INV-2"], "checked": 0}, stream_mode=["custom", "updates"]))
assert events == [
    ("custom", {"progress": 1, "of": 2, "invoice": "INV-1"}),
    ("custom", {"progress": 2, "of": 2, "invoice": "INV-2"}),
    ("updates", {"check_invoices": {"checked": 2}}),
]
```

## Control: limits, retries, parallelism and hand-offs

- **Recursion limit.** A run stops with `GraphRecursionError` after `recursion_limit` super-steps. Older releases
  defaulted to 25; langgraph 1.2 defaults to 10,007 (overridable with the `LANGGRAPH_DEFAULT_RECURSION_LIMIT`
  environment variable), which is no loop guard at all, so set it explicitly per run (`{"recursion_limit": 30}`).
- **Retries.** `add_node(..., retry_policy=RetryPolicy(max_attempts=3, retry_on=TimeoutError))` retries a failing node
  with exponential backoff and jitter. Retry only idempotent work.
- **Timeouts.** `add_node` accepts a per-node `timeout` in 1.2; still put timeouts on the model and API calls inside
  the node.
- **Map-reduce.** A conditional edge can return a list of `Send("node", payload)` objects to run one node per item in
  parallel; a reducer merges the results.
- **Hand-offs.** A node can return `Command(update=..., goto="other_node")` to update state and choose the next node in
  one step: the building block for supervisor and multi-agent patterns.
- **Subgraphs.** A compiled graph can be a node in another graph, so teams can own separate agents.

```python
import operator
from typing import Annotated, Literal, TypedDict
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, RetryPolicy

class Ticket(TypedDict):
    text: str
    log: Annotated[list[str], operator.add]

def supervisor(state: Ticket) -> Command[Literal["billing_agent", "ops_agent"]]:
    target = "billing_agent" if "invoice" in state["text"] else "ops_agent"
    return Command(update={"log": [f"handed to {target}"]}, goto=target)

attempts = {"erp": 0}

def billing_agent(state: Ticket) -> dict:
    attempts["erp"] += 1
    if attempts["erp"] < 3:
        raise TimeoutError("ERP did not answer")      # transient: the retry policy handles it
    return {"log": [f"billing done after {attempts['erp']} attempts"]}

def ops_agent(state: Ticket) -> dict:
    return {"log": ["ops done"]}

builder = StateGraph(Ticket)
builder.add_node("supervisor", supervisor)
builder.add_node("billing_agent", billing_agent, retry_policy=RetryPolicy(max_attempts=3, initial_interval=0.01, retry_on=TimeoutError))
builder.add_node("ops_agent", ops_agent)
builder.add_edge(START, "supervisor")
builder.add_edge("billing_agent", END)
builder.add_edge("ops_agent", END)
app = builder.compile()

assert app.invoke({"text": "invoice 9 is wrong", "log": []}, {"recursion_limit": 10})["log"] == [
    "handed to billing_agent",
    "billing done after 3 attempts",
]
assert app.invoke({"text": "restart the sync", "log": []})["log"] == ["handed to ops_agent", "ops done"]
```

## The wider landscape: other frameworks, Google's ADK, MCP and A2A

| Framework | Best at |
|---|---|
| LangChain | Integrations: chat models from many providers, loaders, vector stores, tools |
| LangGraph | Stateful agents as explicit graphs: checkpoints, retries, human-in-the-loop interrupts, streaming, durable execution |
| LlamaIndex | Data and retrieval: ingestion, indexes, RAG pipelines, plus agent workflows |
| OpenAI Agents SDK | Lightweight agents with hand-offs, guardrails, sessions and built-in tracing |
| Google ADK | Agents built around Gemini and Google Cloud: workflow agents, a dev UI and a managed runtime |
| MCP (Model Context Protocol) | Not a framework: an open protocol for connecting AI clients to tool and data servers |

If the stack runs on Google Cloud, know the Google pieces at overview level:

- **Agent Development Kit (ADK):** Google's open-source framework for building agents, with SDKs in Python, Java, Go,
  TypeScript and, most recently, Kotlin. An `LlmAgent` (or `Agent`) has a model, instructions and tools; **workflow agents**
  (`SequentialAgent`, `ParallelAgent`, `LoopAgent`) compose sub-agents deterministically; sessions and memory services
  hold state; it ships a local dev UI and evaluation tooling. It works best with Gemini but is not limited to it.
- **Agent Runtime (formerly Vertex AI Agent Engine):** a managed runtime for deploying agents (ADK, LangGraph and others)
  with sessions, memory, scaling and tracing. In April 2026 Google folded Vertex AI into the **Gemini Enterprise Agent
  Platform** and renamed Agent Engine to Agent Runtime (and Memory Bank to Agent Platform Memory Bank). Interviewers may
  use either name, so know both. Agents can also be deployed as ordinary containers on **Cloud Run** or **GKE**.
- **MCP (Model Context Protocol):** an open protocol, introduced by Anthropic in late 2024 and donated to the Linux
  Foundation's Agentic AI Foundation in December 2025, for exposing **tools, resources and prompts** to any AI client.
  Servers run locally over stdio or remotely over Streamable HTTP. Write a tool server once; every MCP-capable agent can use it.
- **A2A (Agent2Agent):** an open protocol, started by Google and now a Linux Foundation project, for **agents talking to
  other agents** across vendors. An agent publishes an Agent Card (at `/.well-known/agent-card.json`) describing its
  skills and endpoints; clients send it tasks and receive results, including streamed updates.

| | Function calling | MCP | A2A |
|---|---|---|---|
| Connects | One model to your functions | Any AI client to tool and data servers | An agent to another agent |
| Unit of work | A tool call | A tool call, resource read or prompt | A task with its own lifecycle and messages |
| Who decides how | Your code | The MCP server implements the tool | The remote agent decides how to do the task |

## Custom engines vs frameworks

A custom engine is a reasonable choice when the workflow is narrow, the team wants full transparency, or the platform
already has its own state store, queue and tracing. It is mostly code you would write anyway: a loop with limits, a
state store, idempotent tools, an approval mechanism and tracing. A framework earns its place when you need durable
checkpoints, interrupts, streaming, parallel branches and time travel without building them yourself, or when many teams
must build agents the same way.

**Your angle:** "At Quantiphi I built agentic AI workflows with tool-use boundaries, validation loops and
human-in-the-loop checkpoints, with Pydantic schemas validating structured output. LangGraph gives you those same
primitives as a library: state with reducers, checkpointers and `interrupt`. I've worked through LangGraph's current API,
and it maps directly onto those patterns." Say the last sentence only once you have run this chapter's examples yourself.

## Interview questions

### What is an AI agent, and how is it different from a workflow? {core}

An agent is an LLM running in a loop that decides its own next step: it looks at the goal and what has happened so far,
chooses a tool and its arguments, sees the result, and repeats until it decides it is done. A workflow also uses LLMs and
tools, but the sequence of steps is defined in code. Workflows are predictable, testable and cheaper; agents handle
open-ended tasks where the path cannot be known in advance.

I default to a workflow and add autonomy only where it pays off, such as open-ended investigation across several systems.
Even then, the agent runs inside code-enforced limits: an allow-list of tools, validated arguments, step and cost budgets,
and human approval for side effects. In LangGraph the two are on one spectrum: a graph with fixed edges is a workflow, and
a conditional edge driven by model output adds agency.

### Explain the agent loop (ReAct), and where you put the controls. {core}

ReAct, "reason plus act", interleaves reasoning and actions. The model sees the goal, the history and the tool
definitions, and proposes a tool call. My code validates the arguments, checks the caller's permissions, runs the tool and
returns the result as a tool message. The model then continues or answers. Grounding each step in real observations
reduces hallucination compared with reasoning alone, and the trace of thought, action and observation makes the agent's
behaviour inspectable. Modern tool-calling APIs implement this loop natively.

The controls belong in that middle step, never in the prompt. Unknown tools are rejected. Invalid arguments go back as
errors the model can fix. Writes are idempotent and may need approval. A step limit, timeouts and a cost budget end the
loop deterministically, and every step is traced.

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

**Short-term memory** is the thread: the conversation, tool results and state in the context window and the
checkpointer, trimmed or summarised as it grows. **Long-term memory** lives outside the thread, in a store keyed by user
or tenant (LangGraph has a store interface for this, or use your own database or a vector index for semantic recall), and
is retrieved when relevant: user preferences, past cases, facts learned earlier. **Workflow state** (which step, what was
approved) belongs in a durable store, such as LangGraph checkpoints or your own database, so a run can resume after a
crash or a long human review.

Memory is user data: scope it per user and tenant, set retention, let users see and delete it, and never let one tenant's
memory leak into another's runs. With PHI it is regulated data, so access control and audit apply too.

### What multi-agent patterns do you know, and when are they worth it? {deep}

Supervisor: one agent routes work to specialist agents and collects results. Hand-offs: agents pass control to each other,
which in LangGraph is `Command(goto=...)`. Hierarchical: supervisors of supervisors. Parallel specialists with an
aggregator. They are worth it when parts of the task need genuinely different tools, instructions or permissions, or can
run in parallel. Separate agents also give you least privilege, such as a read-only research agent and a separate acting
agent.

The costs are real: more tokens, more latency, more failure points and much harder debugging, because errors compound
across hand-offs. I start with one agent or a workflow and split only when evaluation shows the single agent cannot cope.

### LangChain, LangGraph, LlamaIndex, ADK or a custom engine: how do you choose? {core}

LangChain for integrations, when you need many model providers, loaders or vector stores quickly. LangGraph when the agent
has real state and control flow: branches, retries, durable checkpoints, human interrupts and streaming, because the graph
makes behaviour explicit. LlamaIndex when the problem is mostly data ingestion and retrieval. The OpenAI Agents SDK for a
lightweight agent with hand-offs, guardrails and tracing. Google's ADK when the platform is built around Gemini and Google
Cloud and you want its workflow agents, dev UI and a smooth path to Agent Runtime, the managed runtime formerly called
Agent Engine. A custom engine when the workflow is narrow and the platform already provides state, queues and tracing: the
core loop is short, and writing it directly with Pydantic validation keeps it transparent and easy to audit.

In practice they combine: LangChain models and tools inside LangGraph nodes, or ADK and LangGraph agents talking over A2A.
I choose a framework for the problems it solves, and follow what the team has standardised on.

### What is MCP? {core}

The Model Context Protocol is an open protocol for connecting AI applications to tools and data. An MCP server exposes
tools, resources and prompts in a standard format, and any MCP-capable client, such as an IDE assistant, a chat app or
your own agent, can use them. Servers run locally over stdio or remotely over Streamable HTTP. Anthropic introduced it in
late 2024, and in December 2025 it was donated to the Linux Foundation's Agentic AI Foundation. Think of it as a USB port
for tools: write an integration once, for example "search tickets", instead of once per framework.

The security model still applies: an MCP server acts with the permissions you give it, so authenticate it, give it least
privilege, and treat third-party servers and their outputs as untrusted.

### What guardrails do you put around an agent, especially one that acts on real systems? {core}

Defence in depth, enforced in code rather than in the prompt. An allow-list of tools for the task, and narrow tools such
as `draft_purchase_order` rather than generic ones such as `call_erp_api`. Arguments validated with schemas and business
rules. Least-privilege credentials per tool, read-only unless writing is required, with the end user's permissions
enforced inside each tool. Dry runs or diffs shown before execution, and human approval for anything irreversible,
external or above a threshold. Idempotency keys on writes. Step, time, token and cost limits. Output validation,
sensitive-data minimisation and redaction, full tracing, an audit log of every proposal, approval and action, a kill
switch, and an evaluation suite that runs on every change.

Untrusted content, such as emails, documents or tool results, is treated as data, because indirect prompt injection is
the main way an agent gets turned against its users.

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

At two levels. Outcome: did it complete the task correctly, judged on a set of realistic scenarios with expected
results, checked by code where possible and by humans or a calibrated LLM judge otherwise. Trajectory: did it take
sensible steps, measured by tool-selection accuracy, argument validity, step count, loops, policy violations, cost and
latency. I include adversarial cases such as injection attempts, missing data and failing tools, and run the suite in CI
on every prompt, model or graph change. With a fake model, graph logic such as routing, interrupts and limits can be unit
tested deterministically, as in this chapter.

### How do you trace and debug agent runs in production?

Every run gets a trace with a span per node, model call and tool call: prompt and model version, inputs and outputs,
tokens, latency, cost, errors, validation outcomes and human decisions, tied to the run ID the UI shows. LangSmith
integrates directly with LangGraph; Langfuse, Arize Phoenix and OpenTelemetry-based tracing work across the stack.
Dashboards and alerts sit on success rate, escalation rate, validation failures, step counts, cost per task and latency.

For debugging a specific run, the checkpoint history is powerful: I can inspect the state at each step, replay from a
checkpoint, or fork with `update_state` to test a fix. Redact or tokenise secrets and personal data in traces, and
restrict who can view them.

### How do you control agent cost and latency?

Use a workflow instead of an agent where you can; route simple steps to small, fast models and keep the large model
for planning or hard reasoning; cap steps and tokens; cache tool results and repeated prompts (including provider
prompt caching for long shared prefixes); run independent tool calls in parallel; keep tool outputs compact, returning
only the fields the model needs; and move non-interactive work to background jobs. Track cost per completed task, not
per call, because retries and loops are where money disappears.

### How do you handle tool failures and retries inside an agent?

Transient failures (timeouts, rate limits) are retried in code with backoff, either with a node's retry policy or inside
the tool, and only for idempotent operations. Permanent failures go back to the model as structured, informative tool
results, such as "vendor not found" or "rate limited, retry later", so it can adapt instead of crashing the loop. Every
call has a timeout. When the step or error budget runs out, the run ends with a clear status and becomes a human task with
full context, not a guess. Write tools take idempotency keys, so a retry or a resume after a crash cannot create a second
purchase order.

### How do you keep sensitive data such as PHI safe in an agent?

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

Structure it: the goal, the steps and tools, the boundaries, the validation loop, the human checkpoint, and what you would
add next. "At Quantiphi I worked on a Document AI platform on GCP. ML-extracted fields from documents went through
Pydantic schemas that enforced the data contract, as the quality gate before human review. Reviewers corrected and
approved in an Angular front end, and approved data was submitted to external APIs. Around that we built agentic workflows
with tool-use boundaries, validation loops and human-in-the-loop checkpoints, running on Cloud Run."

Close with what you would add next, for example an evaluation set built from reviewer corrections, and connect it to the
job in front of you: for agents that act on enterprise systems, approvals before side effects and the run's progress
streamed live to the UI. Use only details you can defend under follow-up questions, and do not quote metrics you cannot
back up.

### What is LangGraph, and why use it instead of a plain loop? {core}

LangGraph is a library for building stateful agent workflows as graphs. You define a typed state, nodes that return
partial updates, and edges, including conditional ones. Its value is in what it gives you for free: checkpointing of
state after every step, `interrupt` to pause for a human and resume days later, streaming of updates and tokens,
parallel branches, retries per node, and time travel through the run's history.

A plain loop is fine for a short, narrow agent. Once you need durable pauses, crash recovery or complex branching, you
would end up rebuilding those features yourself, and LangGraph makes the control flow explicit and testable.

### How do state and reducers work in LangGraph?

The state is a typed schema shared by all nodes. Each node returns only the keys it wants to change, and a reducer
decides how each change is combined with the current value. The default reducer overwrites. `operator.add` on a list
appends. `add_messages` appends chat messages and replaces any that have the same ID.

Reducers matter when nodes run in parallel in the same super-step: two branches can both append to a results list
without overwriting each other. A common bug is forgetting the reducer, and then one parallel branch's output silently
wins.

### How do conditional edges and routing work?

`add_conditional_edges(source, router)` calls the router function with the state after the source node runs. The router
returns the name of the next node (or several, or `END`). Typing its return value as a `Literal` of node names documents
the possible paths. Routing can be plain code, such as "if the last message has tool calls, go to tools", or based on a
model's classification. A node can also return `Command(goto=...)` to choose the next node itself while updating state.

### How does human-in-the-loop work in LangGraph? {core}

Inside a node you call `interrupt(payload)`, for example with the action that needs approval. The graph saves a
checkpoint and returns, with the payload under `__interrupt__`, so the backend can show an approval card in the UI. When
the human decides, possibly days later and from another server, you call the graph with `Command(resume=decision)` and
the same `thread_id`. The interrupted node re-runs from its start, and `interrupt` now returns the decision.

That re-run detail matters: anything before `interrupt` in the node executes again, so side effects must go in a later
node or be idempotent. It needs a checkpointer, and in production a durable one such as Postgres.

**Your angle:** HITL checkpoints were part of the agentic workflows you built at Quantiphi; this is the library version
of the same idea.

### What is a checkpointer, and what would you use in production?

A checkpointer persists the graph's state after each super-step, keyed by a thread ID. It enables resuming after an
interrupt or a crash, conversation memory across turns, and inspecting or replaying past steps. `InMemorySaver` is for
tests and demos. In production I would use a durable saver, such as the Postgres one on Cloud SQL, with retention rules,
because checkpoints contain the full state, possibly including user data.

I would also think about durability mode. The default `"async"` writes checkpoints in the background; `"sync"` waits
for each write before the next step, which suits long-running runs with side effects.

### How do you stream an agent's progress and tokens to the UI? {core}

LangGraph's `stream` gives several modes at once. `updates` yields each node's output, which becomes step events such
as "planned" or "waiting for approval". `messages` yields LLM tokens with the node that produced them, for the chat text.
`custom` carries anything a node writes with the stream writer, such as progress counts. Interrupts appear in the updates
stream.

My backend consumes that stream and translates it into our own event protocol over SSE, with sequence numbers so the
browser can resume after a reconnect. The UI never sees LangGraph's internal shapes, so we could change the engine
without touching the front end.

### How do you stop an agent from looping forever? {core}

Several limits, each enforced in code. A step limit: LangGraph's `recursion_limit` per run, or a counter in my own
loop. Loop detection: the same tool with the same arguments repeated means stop or escalate. Time and cost budgets
across the whole run. A clear stopping status when a limit hits, such as "stopped: step limit", rather than an exception
the user never sees. Hitting a limit is a signal, so I alert on how often it happens and add those runs to the
evaluation set.

### You haven't used LangGraph in production. How would you get productive quickly? {core}

Honestly: at Quantiphi I built agentic workflows with the same patterns, tool-use boundaries, validation loops and
human-in-the-loop checkpoints, so the concepts are familiar; only the API is new. I've worked through the current
LangGraph API: state and reducers, conditional edges, checkpointers, `interrupt` and `Command(resume)`, and the stream
modes.

On the job, I would read the team's existing graphs, write tests with a fake chat model so graph logic runs without an
API, and pair on the first feature. The hard parts of agent systems are the same in any framework: idempotent tools,
approval design, limits, streaming and evaluation, and that is where my experience applies.

Claim "I've worked through the API" only after running this chapter's examples yourself.

### What is A2A, and how is it different from MCP? {deep}

A2A, Agent2Agent, is an open protocol, started by Google and now under the Linux Foundation, for agents to delegate work
to other agents, including ones built on other frameworks or by other vendors. An agent publishes an Agent Card at a
well-known URL that describes its skills and how to call it. Clients send it tasks, follow the task's lifecycle, and can
receive streamed updates.

The difference: MCP connects an agent to tools, where the caller decides what to do and the tool does exactly that. A2A
connects an agent to another agent, which decides for itself how to do the task. They complement each other: an agent can
use MCP tools internally and be reachable by other agents over A2A.

### What is Google's ADK, and where does Agent Runtime fit?

The Agent Development Kit is Google's open-source framework for building agents, available in Python, Java, Go,
TypeScript and Kotlin (ADK for Kotlin reached 1.0 in September 2026). You define LLM agents with a model, instructions and tools, and compose them with workflow agents:
sequential, parallel and loop. It provides sessions, memory, a local dev UI and evaluation tooling, and works best with
Gemini.

Agent Runtime, which was called Vertex AI Agent Engine until Google folded Vertex AI into the Gemini Enterprise Agent
Platform in April 2026, is the managed runtime for deploying agents, whether built with ADK, LangGraph or other
frameworks, with sessions, memory, scaling and tracing handled for you. The alternative is to deploy the agent as a
container on Cloud Run or GKE and own those pieces yourself.

### How do you run work in parallel inside a graph? {deep}

Two ways. Static fan-out: several edges from one node, so the targets run in the same super-step. Dynamic fan-out: a
conditional edge returns a list of `Send(node, payload)`, one per item, such as one per invoice, and LangGraph runs them
in parallel. Either way, the results come back through a reducer, such as `operator.add` on a results list, which is
what makes parallel writes safe. Limit the concurrency if each branch calls a rate-limited external API.

### How would you replay or fix a run that went wrong? {deep}

With a checkpointer, `get_state_history` lists every checkpoint of a thread, newest first, with its state and next node.
I can resume from any checkpoint by passing its config, which replays from that point, or call `update_state` on it to
change a value, such as a corrected field, which creates a new branch, and continue from there. That turns "the agent
did something odd on step 4" into a reproducible case: I copy the state into a test and replay it against the fixed
graph.

### How do you change a graph while runs are paused mid-flight? {deep}

Paused runs hold checkpoints that refer to node names and state keys, so changes must be backward compatible, like
database migrations. Add new state keys with defaults rather than renaming. Keep old node names until no paused run
points at them. For breaking changes, version the graph and let old threads finish on the old version while new threads
start on the new one. I also test resuming real checkpoints from the previous version in CI. This is the same discipline
as versioning long-running workflows in Temporal or Step Functions.

## Coding problems

### Build an approval-gated graph with edits {medium core}

Using LangGraph, build a graph `draft → review → (execute | END)` for purchase orders. `draft` proposes
`{"vendor": "V001234", "amount": 4200}`. `review` calls `interrupt` with the draft; the human's answer is one of
`{"decision": "approve"}`, `{"decision": "reject"}` or `{"decision": "edit", "amount": <number>}`. An edit changes the
amount and then executes. `execute` returns `{"po": f"PO for {amount}"}`. Show that each answer works, with a separate
`thread_id` per run.

#### Hints

1. Compile with `InMemorySaver()`; the first `invoke` returns with `__interrupt__`, and you resume with
   `Command(resume=answer)` on the same config.
2. `review` returns a partial update, the possibly edited draft plus an `approved` flag, and a conditional edge routes on
   that flag.
3. Keep the side effect in `execute`, not in `review`, because `review` re-runs from its start on resume.

#### Solution

The human's answer is just data returned by `interrupt`. The routing function turns it into a path. Putting the side
effect in its own node means re-running `review` on resume is harmless.

```python
from typing import Literal, TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

class POState(TypedDict, total=False):
    draft: dict
    approved: bool
    po: str

def draft(state: POState) -> dict:
    return {"draft": {"vendor": "V001234", "amount": 4200}}

def review(state: POState) -> dict:
    answer = interrupt({"draft": state["draft"]})
    if answer["decision"] == "edit":
        return {"draft": {**state["draft"], "amount": answer["amount"]}, "approved": True}
    return {"approved": answer["decision"] == "approve"}

def route(state: POState) -> Literal["execute", "__end__"]:
    return "execute" if state["approved"] else END

def execute(state: POState) -> dict:
    return {"po": f"PO for {state['draft']['amount']}"}

builder = StateGraph(POState)
builder.add_node("draft", draft)
builder.add_node("review", review)
builder.add_node("execute", execute)
builder.add_edge(START, "draft")
builder.add_edge("draft", "review")
builder.add_conditional_edges("review", route)
builder.add_edge("execute", END)
app = builder.compile(checkpointer=InMemorySaver())

def run(thread: str, answer: dict) -> dict:
    config = {"configurable": {"thread_id": thread}}
    paused = app.invoke({}, config)
    assert paused["__interrupt__"][0].value == {"draft": {"vendor": "V001234", "amount": 4200}}
    return app.invoke(Command(resume=answer), config)

assert run("t-approve", {"decision": "approve"})["po"] == "PO for 4200"
assert "po" not in run("t-reject", {"decision": "reject"})
edited = run("t-edit", {"decision": "edit", "amount": 3900})
assert edited["po"] == "PO for 3900" and edited["draft"]["amount"] == 3900
```

Complexity: O(1) work per step; each run writes one checkpoint per super-step.

#### Follow-ups

- **How would the UI resume a run?** The approval card posts the decision to the backend, which calls
  `invoke(Command(resume=...))` with the run's thread ID, ideally from a worker, and streams the rest of the run.
- **What if the answer is malformed?** Validate it with a Pydantic model before resuming, or loop: call `interrupt`
  again with an error message until the answer is valid.

### Write a custom agent loop with limits and loop detection {medium core}

Without a framework, write `run_agent(model, tools, goal, max_steps=6)`. `model(messages)` returns either
`{"tool": name, "args": {...}}` or `{"final": text}`. Run allow-listed tools and append results as `tool` messages;
report unknown tools and exceptions back to the model as error results; if the model requests the **same tool with the
same arguments** twice in a row, stop with `"stopped: repeated call"`; after `max_steps` model calls, stop with
`"stopped: step limit"`. Return the final text or the stop status. Test with a scripted fake model.

#### Hints

1. Keep `messages` starting with the goal; loop up to `max_steps` times.
2. Compare the current `(tool, args)` with the previous one. `json.dumps(args, sort_keys=True)` gives a stable key.
3. Wrap tool execution in `try/except` and append the error as the tool result, so the model can recover.

#### Solution

The loop itself is a few lines; the value is in the controls: a hard step limit, an allow-list, errors as data, and
detecting the most common failure mode, an agent repeating the same call. Each tool result is appended right after the
assistant message that requested it, as real chat APIs require.

```python
import json
from collections.abc import Callable
from typing import Any

def run_agent(model: Callable[[list[dict]], dict], tools: dict[str, Callable[..., Any]], goal: str, max_steps: int = 6) -> str:
    messages: list[dict] = [{"role": "user", "content": goal}]
    previous = None
    for _ in range(max_steps):
        decision = model(messages)
        if "final" in decision:
            return decision["final"]
        name, args = decision["tool"], decision.get("args", {})
        key = (name, json.dumps(args, sort_keys=True))
        if key == previous:
            return "stopped: repeated call"
        previous = key
        messages.append({"role": "assistant", "content": json.dumps(decision, sort_keys=True)})
        if name not in tools:
            result = f"error: unknown tool {name!r}; allowed: {sorted(tools)}"
        else:
            try:
                result = str(tools[name](**args))
            except Exception as exc:
                result = f"error: {type(exc).__name__}: {exc}"
        messages.append({"role": "tool", "name": name, "content": result})
    return "stopped: step limit"

def scripted(*decisions: dict) -> Callable[[list[dict]], dict]:
    queue = list(decisions)
    seen: list[list[str]] = []
    def model(messages: list[dict]) -> dict:
        seen.append([m["content"] for m in messages])
        return queue.pop(0)
    model.seen = seen  # type: ignore[attr-defined]
    return model

RUNS = {"r-2": "failed at step 3"}
tools = {"get_run": lambda run_id: RUNS[run_id]}

ok = scripted({"tool": "get_run", "args": {"run_id": "r-2"}}, {"final": "r-2 failed at step 3."})
assert run_agent(ok, tools, "why did r-2 fail?") == "r-2 failed at step 3."

recovers = scripted(
    {"tool": "delete_run", "args": {"run_id": "r-2"}},   # not allow-listed
    {"tool": "get_run", "args": {"run_id": "r-9"}},      # raises KeyError
    {"final": "I could not find run r-9."},
)
assert run_agent(recovers, tools, "check r-9") == "I could not find run r-9."
# History on the third call: goal, call, error, call, error. Each result follows the call that asked for it.
assert len(recovers.seen[2]) == 5 and '"delete_run"' in recovers.seen[2][1]
assert recovers.seen[2][2].startswith("error: unknown tool 'delete_run'")
assert recovers.seen[2][4].startswith("error: KeyError")

stuck = scripted(*[{"tool": "get_run", "args": {"run_id": "r-2"}}] * 5)
assert run_agent(stuck, tools, "loop") == "stopped: repeated call"

wandering = scripted(*[{"tool": "get_run", "args": {"run_id": f"r-{i}"}} for i in range(10)])
assert run_agent(wandering, tools, "wander", max_steps=4) == "stopped: step limit"
```

Complexity: at most `max_steps` model and tool calls; memory grows with the message history.

#### Follow-ups

- **How would you validate arguments?** Give each tool a Pydantic model and validate before running; return the errors
  to the model as the tool result.
- **What would make this production-ready?** Persist the messages and step count after every step (a checkpoint), add
  timeouts and a cost budget, approvals for write tools, idempotency keys, and a trace span per step.

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

### Fan out checks with Send and merge the results {medium}

An agent must check a list of invoices against a purchase order total. Using LangGraph's `Send`, run one `check` node per
invoice in parallel: each returns `{"invoice": id, "ok": amount <= limit}` appended to a `results` list. A final
`summarise` node sets `summary` to `"all ok"` or `"flagged: <ids>"`, listing flagged invoice IDs in the input order. The
input is `{"invoices": [{"id": ..., "amount": ...}], "limit": number}`.

#### Hints

1. A conditional edge from `START` returns `[Send("check", {...}) for each invoice]`; pass the limit in each payload.
2. Declare `results: Annotated[list[dict], operator.add]` so the parallel writes are merged, not overwritten.
3. Parallel results can arrive in any order, so sort by the original position when you summarise.

#### Solution

`Send` is LangGraph's map step and the reducer is the reduce step. Carrying the index in each payload makes the summary
deterministic regardless of which branch finishes first.

```python
import operator
from typing import Annotated, TypedDict
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

class Batch(TypedDict, total=False):
    invoices: list[dict]
    limit: float
    results: Annotated[list[dict], operator.add]
    summary: str

def fan_out(state: Batch) -> list[Send]:
    return [Send("check", {"pos": i, "invoice": inv, "limit": state["limit"]}) for i, inv in enumerate(state["invoices"])]

def check(payload: dict) -> dict:
    inv = payload["invoice"]
    return {"results": [{"pos": payload["pos"], "invoice": inv["id"], "ok": inv["amount"] <= payload["limit"]}]}

def summarise(state: Batch) -> dict:
    flagged = [r["invoice"] for r in sorted(state["results"], key=lambda r: r["pos"]) if not r["ok"]]
    return {"summary": "all ok" if not flagged else "flagged: " + ", ".join(flagged)}

builder = StateGraph(Batch)
builder.add_node("check", check)
builder.add_node("summarise", summarise)
builder.add_conditional_edges(START, fan_out, ["check"])
builder.add_edge("check", "summarise")
builder.add_edge("summarise", END)
app = builder.compile()

out = app.invoke({"invoices": [{"id": "INV-1", "amount": 900}, {"id": "INV-2", "amount": 1500}, {"id": "INV-3", "amount": 2000}], "limit": 1000, "results": []})
assert len(out["results"]) == 3
assert out["summary"] == "flagged: INV-2, INV-3"
assert app.invoke({"invoices": [{"id": "INV-9", "amount": 10}], "limit": 1000, "results": []})["summary"] == "all ok"
```

Complexity: O(n) checks, run in parallel; the summary sorts n results, O(n log n).

#### Follow-ups

- **What if each check calls a rate-limited ERP API?** Cap concurrency (a semaphore in the tool, or `max_concurrency`
  in the run config), and add a retry policy on the `check` node.
- **What if there are 10,000 invoices?** Batch them per `Send`, or move the work to a task queue and have the graph wait
  for the result, so one run does not hold thousands of branches in memory.

### Bridge a graph's stream to SSE frames {easy}

Write `to_sse(stream)` that turns the `(mode, payload)` pairs from
`app.stream(..., stream_mode=["updates", "custom"])` into SSE text frames for the browser. Use the app's own protocol:
each node update becomes `event: step` with `{"node": name}`; each custom payload becomes `event: progress` with the
payload; an `__interrupt__` update becomes `event: approval` with the interrupt's value. Number the frames with `id:`
starting at 1, and finish with `event: done` and `data: {}`. Test it on a real graph that writes progress and then
interrupts.

#### Hints

1. An SSE frame is `id: <n>\nevent: <name>\ndata: <json>\n\n`.
2. In `updates` mode, the payload is a dict whose keys are node names, or `"__interrupt__"` mapped to a tuple of
   `Interrupt` objects with a `.value`.
3. Write a small `frame(event, data)` helper that increments the counter, and keep the translation logic separate from
   the HTTP layer.

#### Solution

The translator is where the backend decouples the engine from the UI: LangGraph's shapes go in, the app's own
event names go out, each with an ID the browser can send back as `Last-Event-ID` to resume.

```python
import json
import operator
from collections.abc import Iterable, Iterator
from typing import Annotated, TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

def to_sse(stream: Iterable[tuple[str, dict]]) -> Iterator[str]:
    counter = 0
    def frame(event: str, data: dict) -> str:
        nonlocal counter
        counter += 1
        return f"id: {counter}\nevent: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"
    for mode, payload in stream:
        if mode == "custom":
            yield frame("progress", payload)
        elif mode == "updates":
            for node, update in payload.items():
                if node == "__interrupt__":
                    for item in update:
                        yield frame("approval", item.value)
                else:
                    yield frame("step", {"node": node})
    yield frame("done", {})

class S(TypedDict, total=False):
    log: Annotated[list[str], operator.add]
    approved: str

def plan(state: S) -> dict:
    get_stream_writer()({"pct": 50})
    return {"log": ["planned"]}

def approve(state: S) -> dict:
    return {"approved": interrupt({"action": "create_po", "amount": 4200})}

builder = StateGraph(S)
builder.add_node("plan", plan)
builder.add_node("approve", approve)
builder.add_edge(START, "plan")
builder.add_edge("plan", "approve")
builder.add_edge("approve", END)
app = builder.compile(checkpointer=InMemorySaver())

config = {"configurable": {"thread_id": "sse-1"}}
frames = list(to_sse(app.stream({"log": []}, config, stream_mode=["updates", "custom"])))
assert frames == [
    'id: 1\nevent: progress\ndata: {"pct":50}\n\n',
    'id: 2\nevent: step\ndata: {"node":"plan"}\n\n',
    'id: 3\nevent: approval\ndata: {"action":"create_po","amount":4200}\n\n',
    "id: 4\nevent: done\ndata: {}\n\n",
]
```

Complexity: O(number of events); each frame is built once.

#### Follow-ups

- **How do you resume after a disconnect?** Store frames per run in a short replay buffer (Redis or memory) keyed by
  ID; on reconnect, send everything after the client's `Last-Event-ID`, then continue live.
- **Where do LLM tokens go?** Add `"messages"` to the stream modes and emit `event: token` frames with the chunk text,
  perhaps batching a few tokens per frame to cut overhead.
