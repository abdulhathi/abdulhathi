---
title: State machines and workflow orchestration
goal: Model an agent run as an explicit state machine that survives crashes, pauses for human approval, compensates failed steps and shows its state live, and explain when to reach for XState, Temporal or Cloud Workflows.
minutes: 45
---

The JD asks for "resilient application state machines" that "coordinate autonomous agent workflows and external enterprise APIs". An agent run is a long, multi-step process: it plans, calls tools, may stop for a human to approve an action, may fail halfway through creating something in an ERP, and has to keep going after a worker restarts. If that logic lives in a tangle of flags (`isRunning`, `isWaiting`, `hasError`), you get impossible combinations and runs stuck forever. An **explicit state machine** names every state, allows only the listed transitions, and makes the run's state something you can store, show on a dashboard, audit and resume.

**Your angle:** the agentic workflows you built at Quantiphi had tool-use boundaries, validation loops and human-in-the-loop checkpoints. Those are states and transitions: "extracting", "validating", "awaiting review", "submitted". Use that as your opening example.

## Finite state machines and statecharts

A **finite state machine** is a set of states, a set of events, and a transition function `(state, event) → next state`. Anything not in the table is rejected. A **statechart** (Harel's extension, which XState implements) adds what real workflows need:

| Feature | What it adds | Agent-run example |
|---|---|---|
| Guards | A transition only happens if a condition holds | "Call another tool" only if the step budget is not used up |
| Actions / effects | Work done on a transition or on entering a state | Entering `awaitingApproval` notifies the approver |
| Context (extended state) | Data that travels with the state | Step count, token usage, the pending tool call |
| Delayed transitions | Move automatically after a time | Approval expires after 24 hours |
| Hierarchy (nested states) | States inside states share transitions | `active` contains `planning` and `runningTool`; `cancel` works from anywhere in `active` |
| Parallel states | Independent regions at once | The run and its streaming connection each have their own state |
| Final states | The machine is done | `completed`, `failed`, `cancelled` |

```text
            start            toolChosen               needsApproval
 queued ──────────▶ planning ──────────▶ runningTool ───────────────▶ awaitingApproval
                     ▲   │                 │    │                        │      │
                     │   │ answerReady     │    │ toolFailed      approved│      │rejected / timeout
             toolOk  │   ▼                 │    ▼                        ▼      ▼
                     └─ completed ◀────────┘  failed              runningTool  cancelled / expired
                    (cancel is allowed from every non-final state)
```

## Keep transitions pure, run effects separately

The most useful design rule: **the transition function does no I/O**. It takes the current state and an event and returns the next state plus a list of effects to perform. A separate runner performs the effects (call the LLM, call the tool, notify the approver) and feeds the results back in as new events. That makes the logic trivially testable, lets you replay it, and keeps "what is allowed" in one table.

```python
from dataclasses import dataclass, replace
from typing import Literal

State = Literal["queued", "planning", "running_tool", "awaiting_approval", "completed", "failed", "cancelled"]
TERMINAL = {"completed", "failed", "cancelled"}

# (current state, event) → next state. Anything not listed is an invalid transition.
TRANSITIONS: dict[tuple[str, str], State] = {
    ("queued", "start"): "planning",
    ("planning", "tool_chosen"): "running_tool",
    ("planning", "answer_ready"): "completed",
    ("running_tool", "tool_ok"): "planning",
    ("running_tool", "needs_approval"): "awaiting_approval",
    ("running_tool", "tool_failed"): "failed",
    ("awaiting_approval", "approved"): "running_tool",
    ("awaiting_approval", "rejected"): "cancelled",
}

# What the runner must do when a run enters a state. The transition itself never does I/O.
ON_ENTER: dict[str, str] = {
    "planning": "ask_llm_for_next_step",
    "running_tool": "call_tool",
    "awaiting_approval": "notify_approver",
    "completed": "publish_result",
    "failed": "alert_owner",
    "cancelled": "release_resources",
}


class InvalidTransition(Exception):
    pass


@dataclass(frozen=True)
class Run:
    id: str
    state: State = "queued"
    tool_calls: int = 0
    max_tool_calls: int = 3


def transition(run: Run, event: str) -> tuple[Run, list[str]]:
    """Pure: returns the next run and the effects to execute. Raises on an event the state does not allow."""
    if run.state in TERMINAL:
        raise InvalidTransition(f"run {run.id} is already {run.state}")
    if event == "cancel":
        target: State = "cancelled"
    else:
        found = TRANSITIONS.get((run.state, event))
        if found is None:
            raise InvalidTransition(f"{event!r} is not allowed in state {run.state!r}")
        target = found
    tool_calls = run.tool_calls + (1 if (run.state, event) == ("planning", "tool_chosen") else 0)
    if tool_calls > run.max_tool_calls:  # guard: a step budget stops a runaway agent loop
        target = "failed"
    return replace(run, state=target, tool_calls=tool_calls), [ON_ENTER[target]]


run = Run("run-1")
run, fx = transition(run, "start")
assert (run.state, fx) == ("planning", ["ask_llm_for_next_step"])
run, fx = transition(run, "tool_chosen")
assert (run.state, fx, run.tool_calls) == ("running_tool", ["call_tool"], 1)
run, fx = transition(run, "needs_approval")
assert fx == ["notify_approver"]
run, _ = transition(run, "approved")
assert (run.state, run.tool_calls) == ("running_tool", 1)  # approval resumes the same tool call
run, _ = transition(run, "tool_ok")
run, fx = transition(run, "answer_ready")
assert (run.state, fx) == ("completed", ["publish_result"])

for bad_run, event in [(Run("r2"), "approved"), (run, "cancel")]:
    try:
        transition(bad_run, event)
        raise AssertionError("should have been rejected")
    except InvalidTransition:
        pass

loop = Run("r3", state="planning")
for _ in range(3):
    loop, _ = transition(loop, "tool_chosen")
    loop, _ = transition(loop, "tool_ok")
loop, fx = transition(loop, "tool_chosen")  # a fourth tool call exceeds the budget
assert (loop.state, fx) == ("failed", ["alert_owner"])
```

## Persisting state and resuming after a crash

A workflow that lives only in a worker's memory dies with the worker. Store the run's **state, context and a version number** in the database after every transition. Two rules make that safe:

1. **Optimistic concurrency:** update with `WHERE id = ? AND version = ?`. If two workers (a redelivered message, or a user clicking "approve" twice) both try to advance the same run, only one wins; the other gets a stale-write error, reloads and re-decides.
2. **Checkpoint after each step, and make steps idempotent:** on restart, the worker loads the run and skips steps already recorded as done. There is still a window between "side effect happened" and "checkpoint saved", so the step itself should carry an idempotency key to the external system.

```python
import json
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE runs (id TEXT PRIMARY KEY, state TEXT NOT NULL, context TEXT NOT NULL, version INTEGER NOT NULL)")


class StaleWrite(Exception):
    pass


def create(run_id: str, state: str, context: dict) -> None:
    with db:
        db.execute("INSERT INTO runs VALUES (?, ?, ?, 1)", (run_id, state, json.dumps(context)))


def load(run_id: str) -> tuple[str, dict, int]:
    state, context, version = db.execute("SELECT state, context, version FROM runs WHERE id = ?", (run_id,)).fetchone()
    return state, json.loads(context), version


def save(run_id: str, state: str, context: dict, expected_version: int) -> int:
    """Compare-and-set: succeeds only if nobody else saved since we loaded."""
    with db:
        cur = db.execute(
            "UPDATE runs SET state = ?, context = ?, version = version + 1 WHERE id = ? AND version = ?",
            (state, json.dumps(context), run_id, expected_version),
        )
    if cur.rowcount != 1:
        raise StaleWrite(f"run {run_id} changed since version {expected_version}")
    return expected_version + 1


# Two workers race on the same run: only one transition wins.
create("run-9", "awaiting_approval", {"approved_by": None})
_, ctx_a, v_a = load("run-9")
_, ctx_b, v_b = load("run-9")
save("run-9", "running_tool", {**ctx_a, "approved_by": "alice"}, v_a)
try:
    save("run-9", "cancelled", ctx_b, v_b)
    raise AssertionError("the second write should be rejected")
except StaleWrite:
    pass
assert load("run-9")[:2] == ("running_tool", {"approved_by": "alice"})

# Resume after a crash without repeating completed steps.
STEPS = ["fetch_ticket", "draft_reply", "post_reply"]
side_effects: list[str] = []


def execute(run_id: str, crash_before: str | None = None) -> None:
    _, ctx, version = load(run_id)
    for step in STEPS:
        if step in ctx["completed"]:
            continue  # finished before the crash: never repeat its side effect
        if step == crash_before:
            raise RuntimeError("worker killed")
        side_effects.append(step)  # the real step sends an idempotency key, for the crash-before-checkpoint window
        ctx["completed"].append(step)
        version = save(run_id, "running", ctx, version)  # checkpoint after every step
    save(run_id, "completed", ctx, version)


create("run-10", "running", {"completed": []})
try:
    execute("run-10", crash_before="post_reply")
except RuntimeError:
    pass
assert side_effects == ["fetch_ticket", "draft_reply"]
execute("run-10")  # the redelivered message resumes from the checkpoint
assert side_effects == ["fetch_ticket", "draft_reply", "post_reply"]
assert load("run-10")[0] == "completed"
```

## XState 5: the same idea as a statechart

XState is the standard statechart library in TypeScript. It runs in the browser (UI state for the chat: idle, sending, streaming, awaiting approval, error) and in Node (a run's lifecycle in a service). `setup()` declares the types, guards, actions and named delays; `createMachine()` declares the states; `createActor()` runs it. Snapshots can be persisted as JSON and restored later, which is exactly the "resume after a crash" requirement. Here the clock is simulated, so the 24-hour approval timeout is tested instantly.

```ts
import assert from 'node:assert/strict';
import { assign, createActor, setup, SimulatedClock } from 'xstate';

type RunEvent =
  | { type: 'START' }
  | { type: 'TOOL_CHOSEN' }
  | { type: 'TOOL_OK' }
  | { type: 'NEEDS_APPROVAL' }
  | { type: 'APPROVE'; by: string }
  | { type: 'REJECT' }
  | { type: 'ANSWER_READY' }
  | { type: 'CANCEL' };

const runMachine = setup({
  types: {
    context: {} as { toolCalls: number; maxToolCalls: number; approvedBy: string | null },
    events: {} as RunEvent,
  },
  guards: {
    underBudget: ({ context }) => context.toolCalls < context.maxToolCalls,
  },
  actions: {
    countToolCall: assign({ toolCalls: ({ context }) => context.toolCalls + 1 }),
    recordApprover: assign({ approvedBy: ({ event }) => (event.type === 'APPROVE' ? event.by : null) }),
  },
  delays: { approvalTimeout: 24 * 60 * 60 * 1000 },
}).createMachine({
  id: 'agentRun',
  initial: 'queued',
  context: { toolCalls: 0, maxToolCalls: 2, approvedBy: null },
  states: {
    queued: { on: { START: 'active' } },
    active: {
      initial: 'planning',
      on: { CANCEL: 'cancelled' }, // one transition covers every nested state
      states: {
        planning: {
          on: {
            TOOL_CHOSEN: [
              { guard: 'underBudget', actions: 'countToolCall', target: 'runningTool' },
              { target: '#agentRun.failed' },
            ],
            ANSWER_READY: '#agentRun.completed',
          },
        },
        runningTool: { on: { TOOL_OK: 'planning', NEEDS_APPROVAL: 'awaitingApproval' } },
        awaitingApproval: {
          on: { APPROVE: { target: 'runningTool', actions: 'recordApprover' }, REJECT: '#agentRun.cancelled' },
          after: { approvalTimeout: '#agentRun.expired' },
        },
      },
    },
    completed: { type: 'final' },
    failed: { type: 'final' },
    cancelled: { type: 'final' },
    expired: { type: 'final' },
  },
});

// The happy path, logging every state change the way a dashboard would receive it.
const seen: unknown[] = [];
const run = createActor(runMachine).start();
run.subscribe((snapshot) => seen.push(snapshot.value));
run.send({ type: 'START' });
run.send({ type: 'TOOL_CHOSEN' });
run.send({ type: 'NEEDS_APPROVAL' });
run.send({ type: 'APPROVE', by: 'alice' });
run.send({ type: 'TOOL_OK' });
run.send({ type: 'ANSWER_READY' });
assert.equal(run.getSnapshot().value, 'completed');
assert.equal(run.getSnapshot().context.approvedBy, 'alice');
assert.deepEqual(seen.at(2), { active: 'awaitingApproval' });
run.send({ type: 'CANCEL' }); // ignored: final states accept no events
assert.equal(run.getSnapshot().value, 'completed');

// An approval nobody answers expires after 24 hours (simulated).
const clock = new SimulatedClock();
const waiting = createActor(runMachine, { clock }).start();
waiting.send({ type: 'START' });
waiting.send({ type: 'TOOL_CHOSEN' });
waiting.send({ type: 'NEEDS_APPROVAL' });
const stored = JSON.stringify(waiting.getPersistedSnapshot()); // what you would save in Postgres
clock.increment(24 * 60 * 60 * 1000);
assert.equal(waiting.getSnapshot().value, 'expired');

// Restore the saved snapshot in a new process and carry on from the same state.
const clock2 = new SimulatedClock();
const resumed = createActor(runMachine, { snapshot: JSON.parse(stored), clock: clock2 }).start();
assert.deepEqual(resumed.getSnapshot().value, { active: 'awaitingApproval' });
// The trap: the persisted snapshot holds state and context, not pending timers. The 24-hour expiry is NOT re-armed.
clock2.increment(25 * 60 * 60 * 1000);
assert.deepEqual(resumed.getSnapshot().value, { active: 'awaitingApproval' });
resumed.send({ type: 'APPROVE', by: 'bob' });
resumed.send({ type: 'TOOL_OK' });
resumed.send({ type: 'TOOL_CHOSEN' });
resumed.send({ type: 'TOOL_OK' });
resumed.send({ type: 'TOOL_CHOSEN' }); // a third tool call: over the budget of 2
assert.equal(resumed.getSnapshot().value, 'failed');
resumed.stop();
```

The block above also shows a trap worth mentioning in an interview. `getPersistedSnapshot()` saves the state value and context, but **not pending delayed events**, so a restored actor does not re-arm the 24-hour approval timeout: after a restart the run would wait forever. XState's timers live in the process. For waits measured in hours or days, store a `deadline` with the run and let something durable send the `EXPIRE` event: a scheduled sweeper, a Cloud Tasks task scheduled for the deadline, or a workflow engine's timer.

## Durable execution engines

Writing your own persisted state machine is fine for one workflow. When you have many long-running workflows with timers, retries and waits for humans, a durable execution engine does the bookkeeping:

| Option | Model | Human approval | Good fit |
|---|---|---|---|
| Your own state machine in Postgres | A state + version per run, workers driven by a queue | An `awaiting_approval` state; the approval API sends the event | One or two workflows, full control, few dependencies |
| Temporal | Workflows written as ordinary code; the engine records an event history and **replays** it to rebuild state, so workflow code must be deterministic; side effects go in activities with retry policies | A **signal** delivers the approval to the running workflow; durable timers can wait for days | Many complex, long-running workflows; strong developer experience |
| Cloud Workflows (GCP) | Steps in YAML or JSON that call HTTP endpoints and Google APIs, with `try`/`retry`; an execution can last up to a year | **Callbacks**: `events.create_callback_endpoint` gives a URL, `events.await_callback` pauses until something calls it (12 hours by default) | Orchestrating Cloud Run services and Google APIs without running an engine |
| AWS Step Functions | A JSON state language (Standard and Express workflows) | Wait for a task token | The AWS equivalent |
| LangGraph | A graph of nodes over a shared state, with checkpointers per thread | `interrupt()` pauses the graph and resuming continues it | Agent-specific logic around LLM calls (see [Agent frameworks](#/agent-frameworks)) |

Temporal's determinism rule trips people up: workflow code must not read the clock, generate random numbers or call APIs directly, because on replay it would get different answers. Use the SDK's workflow-safe time and side-effect APIs, and put all I/O in activities.

## Sagas: transactions across systems

An agent creating a purchase order might **reserve budget** in your service, **create the PO** in SAP and **attach an approval record** in a document system. No database transaction spans those three. A **saga** is a sequence of local steps where each step has a **compensating action** that semantically undoes it (cancel the PO, release the budget). If step 3 fails, run the compensations for steps 2 and 1, in reverse order.

```python
from collections.abc import Callable

Step = tuple[str, Callable[[], None], Callable[[], None]]  # name, action, compensation


def run_saga(steps: list[Step], log: list[str]) -> bool:
    """Run steps in order. If one fails, compensate the completed steps in reverse order."""
    completed: list[Step] = []
    for step in steps:
        name, action, _ = step
        try:
            action()
        except Exception as exc:
            log.append(f"failed {name}: {exc}")
            for done_name, _, compensate in reversed(completed):
                compensate()
                log.append(f"compensated {done_name}")
            return False
        completed.append(step)
        log.append(f"done {name}")
    return True


budget = {"reserved": 0}
sap_pos: dict[str, str] = {}


def attach_record_failing() -> None:
    raise RuntimeError("document service returned 500 after retries")


steps: list[Step] = [
    ("reserve_budget", lambda: budget.update(reserved=5000), lambda: budget.update(reserved=0)),
    ("create_po", lambda: sap_pos.update({"PO-4501": "open"}), lambda: sap_pos.update({"PO-4501": "cancelled"})),
    ("attach_approval_record", attach_record_failing, lambda: None),
]
log: list[str] = []
assert run_saga(steps, log) is False
assert log == [
    "done reserve_budget",
    "done create_po",
    "failed attach_approval_record: document service returned 500 after retries",
    "compensated create_po",
    "compensated reserve_budget",
]
assert budget == {"reserved": 0}
assert sap_pos == {"PO-4501": "cancelled"}  # a compensation is a business undo (cancel), not a delete
```

Things to say about sagas:

- Compensations are **business operations**, not rollbacks: the PO existed for a moment and is now cancelled, and the audit trail shows both.
- Order steps so the hard-to-undo ones come last. A step that cannot be compensated (sending an email to a supplier) is the **pivot**: after it, you only retry forward.
- Compensations can fail too, so they must be idempotent and retried, and a saga that cannot compensate ends in a "needs manual intervention" state with an alert.
- A step that **timed out** may still have succeeded on the other side. Treat it as "unknown": check its status by the idempotency key, or run its compensation as well, which is safe because compensations are idempotent ("cancel PO-4501 if it exists").
- Sagas give **eventual** consistency: other readers may see the intermediate state. Show it honestly in the UI ("cancelling…").

## Choreography or orchestration

| | Choreography | Orchestration |
|---|---|---|
| How | Each service reacts to events and emits its own | A central orchestrator tells each service what to do next |
| Strengths | Loose coupling, no central component | The whole workflow is visible in one place; easy to add timeouts, approvals and compensations |
| Weaknesses | The flow is implicit and spread out; hard to answer "where is run 42 stuck?" | The orchestrator is a component you must make reliable |
| Fits | Simple reactions ("run completed → update the dashboard, write the audit log") | Agent runs with approvals and multi-step enterprise transactions |

For agent runs I would orchestrate: the run's state machine is the orchestrator, and it emits events that other services consume choreographically.

## Event sourcing

Instead of storing the current state and overwriting it, **event sourcing** stores the sequence of events (`RunStarted`, `StepCompleted`, `ApprovalGranted`…) and derives the state by folding over them. You get a full audit trail and the ability to rebuild any view. The costs: you must version event schemas forever, rebuilds get slow (fix with snapshots), and queries need separate read models.

```ts
import assert from 'node:assert/strict';

type RunEvent =
  | { type: 'RunStarted'; runId: string }
  | { type: 'StepCompleted'; step: string; tokens: number }
  | { type: 'ApprovalRequested'; tool: string }
  | { type: 'ApprovalGranted'; by: string }
  | { type: 'RunFinished' };

type RunView = {
  status: 'running' | 'awaiting_approval' | 'finished';
  steps: string[];
  tokens: number;
  approvedBy?: string;
};

const initial: RunView = { status: 'running', steps: [], tokens: 0 };

function apply(view: RunView, e: RunEvent): RunView {
  switch (e.type) {
    case 'RunStarted':
      return { ...initial };
    case 'StepCompleted':
      return { ...view, steps: [...view.steps, e.step], tokens: view.tokens + e.tokens };
    case 'ApprovalRequested':
      return { ...view, status: 'awaiting_approval' };
    case 'ApprovalGranted':
      return { ...view, status: 'running', approvedBy: e.by };
    case 'RunFinished':
      return { ...view, status: 'finished' };
    default: {
      const unhandled: never = e; // a new event type is a compile error until it is handled here
      return unhandled;
    }
  }
}

const events: RunEvent[] = [
  { type: 'RunStarted', runId: 'run-7' },
  { type: 'StepCompleted', step: 'plan', tokens: 420 },
  { type: 'ApprovalRequested', tool: 'create_po' },
  { type: 'ApprovalGranted', by: 'alice' },
  { type: 'StepCompleted', step: 'create_po', tokens: 180 },
  { type: 'RunFinished' },
];

const full = events.reduce(apply, initial);
assert.deepEqual(full, { status: 'finished', steps: ['plan', 'create_po'], tokens: 600, approvedBy: 'alice' });

// A snapshot after three events, plus the rest, gives the same answer as a full replay.
const snapshot = events.slice(0, 3).reduce(apply, initial);
assert.equal(snapshot.status, 'awaiting_approval');
assert.deepEqual(events.slice(3).reduce(apply, snapshot), full);
```

## Interview questions

### Why model an agent run as an explicit state machine? {core}

Because an agent run is long, multi-step and interrupted by failures and humans, and implicit state (a set of booleans) allows impossible combinations, such as "running" and "failed" at once, or a run that is approved after it was cancelled. A state machine names every state, lists the allowed transitions, and rejects everything else. The run's state becomes one value you can store, resume, audit and show on a dashboard.

It also gives you natural places for guards (the step budget), timeouts (approval expiry) and side effects (notify the approver on entry). **Your angle:** the Document AI workflows at Quantiphi moved through clear stages with HITL checkpoints between them (AI extraction, schema validation, human review, submission), which map directly onto states and transitions.

### What is the difference between a finite state machine and a statechart?

A finite state machine is flat: states, events and a transition table. A statechart adds hierarchy (nested states that share transitions, such as "cancel from anywhere inside active"), parallel regions, guards, actions, extended state (context) and delayed transitions. Those additions stop the state explosion you get when you try to model a real workflow with a flat machine.

XState implements statecharts in TypeScript, and the same ideas map onto Temporal workflows, Cloud Workflows and LangGraph.

### How do you keep side effects out of the transition logic? {core}

I make the transition function pure: given the current state and an event, it returns the next state and a list of effects, such as "call the tool" or "notify the approver". A runner executes the effects and turns their results into new events ("tool ok", "tool failed"). The rules about what is allowed live in one table, and that table is tested without mocks.

It also makes replay and debugging easy: from the stored event log you can recompute exactly how a run reached its state.

### How do you persist a workflow and resume it after a worker crashes? {core}

After every transition I save the run's state, context and a version number in the database, and each step's completion is recorded as a checkpoint. When the message is redelivered, the new worker loads the run, sees which steps are already done, and continues from there instead of starting over.

There is still a gap between "the side effect happened" and "the checkpoint was saved", so each step also sends an idempotency key (for example `run_id:step_name`) to the external system. A repeat then becomes a no-op downstream.

### Two workers, or two approvals, arrive for the same run at the same moment. What happens? {core}

Only one may win. I use optimistic concurrency: every save is `UPDATE … WHERE id = ? AND version = ?`, and increments the version. The second writer updates zero rows, gets a stale-write error, reloads the current state and re-applies its event, which the state machine may now reject ("approve is not allowed in state cancelled").

An alternative is a lease or row lock per run, so only one worker drives a run at a time. Per-key ordering in the queue (all events for a run go to one consumer) also helps, but I still keep the version check as the safety net.

### How would you implement a human approval step that might take days? {core}

The run enters an `awaiting_approval` state and the worker lets go of it. Nothing should hold a thread or a request open for days. On entry, the effect notifies the approver with a link and the details of the proposed action. The approval API, protected by role-based access control, sends an `approve` or `reject` event, which is validated against the current state and version and resumes the run, so a worker picks it up again.

A timer handles expiry: a delayed transition in XState, a durable timer in Temporal, a callback timeout in Cloud Workflows, or a scheduled job that expires runs whose deadline has passed. Record who approved what and when, for the audit trail.

### What is durable execution, and how does Temporal work? {core}

Durable execution means you write a long-running workflow as ordinary code, and the engine guarantees it runs to completion despite crashes. Temporal records every step's result in an event history. If a worker dies, another worker **replays** the workflow code against that history to rebuild its state, and carries on. Side effects go in activities, which have retry policies; signals deliver external events such as approvals; and timers can sleep for days.

The catch is determinism: workflow code must not read the clock, use random numbers or call APIs directly, because a replay would diverge. You use the SDK's deterministic equivalents, and you version workflow code carefully while runs are in flight.

### How would you choose between your own state machine, Temporal and Cloud Workflows? {deep}

For one or two workflows with simple steps, a state machine persisted in Postgres and driven by a queue is enough, and it keeps dependencies low. For many complex, long-running workflows with timers, retries, approvals and compensation, Temporal saves a lot of bespoke code, at the cost of running (or paying for) a Temporal cluster and learning its determinism rules.

Cloud Workflows suits orchestrating Cloud Run services and Google APIs declaratively, with callbacks for human steps and executions lasting up to a year, but complex logic is awkward in YAML. For the agent's reasoning loop itself, LangGraph's checkpointed graphs are the most natural fit, and they can sit inside any of these.

### What is a saga, and when do you need compensating actions? {core}

A saga is how you get a multi-step business transaction across systems that cannot share a database transaction, for example reserving budget, creating a purchase order in SAP and attaching an approval record. Each step is a local transaction with a compensating action that undoes it semantically. If a later step fails, the saga runs the compensations for the completed steps in reverse order.

Compensations are business operations (cancel the PO, release the budget), not deletes, so the history is preserved. Put steps that cannot be undone, such as emailing a supplier, last.

### What if a compensation fails? {deep}

Then the saga cannot get back to a clean state automatically, so compensations must be idempotent and retried with backoff like any other step. If they still fail, the saga moves to a "needs manual intervention" state, raises an alert, and shows the operator exactly which steps succeeded, which were compensated and which were not.

Prevention helps: order the steps so the risky, hard-to-undo ones come last, validate everything you can before the first side effect (a dry run against the ERP), and reserve rather than commit where the external system supports it.

### Choreography or orchestration for agent workflows? {core}

For the agent run itself I prefer orchestration: one component (the run's state machine, or a Temporal workflow) decides the next step, so timeouts, approvals, compensation and "where is run 42 stuck?" all live in one place. Choreography, where each service reacts to events, keeps services loosely coupled, but the flow becomes implicit and hard to trace.

In practice I combine them: the orchestrator drives the run and emits events such as `run.completed`, and the dashboard, audit log and billing service consume those events independently.

### How do you make each step idempotent?

Give each step a deterministic key, such as `run_id:step_name` (never including the attempt number, or every retry looks new), and use it at every boundary: as the dedupe key in your own database (inside the same transaction as the step's write), and as the idempotency key or external reference when calling another system. Before creating something in an external system, the step can look it up by that reference.

Then design the step as "ensure X exists in state Y" rather than "do X". Re-running it is then harmless.

### How do you handle timeouts inside a workflow?

At three levels. Each external call has its own timeout and retry policy. Each step has a deadline, after which the run moves to a failure or retry path instead of waiting forever. And waiting states, such as an approval, have an expiry that moves the run to `expired` and notifies someone.

The timers must be durable: a `setTimeout` in a worker disappears when the worker restarts. The same goes for an XState `after` delay: a restored snapshot does not re-arm it. Use the engine's timers, a `deadline` column swept by a scheduled job, or Cloud Tasks scheduled for the deadline.

### How do you change a workflow definition while runs are still in flight? {deep}

Treat it like a schema migration. Store the definition version on each run when it starts, and keep old versions runnable until their runs finish. Make changes additive where possible (new states and transitions rather than renamed ones), and migrate in-flight runs explicitly if you must.

Engines have specific tools: Temporal has patching and worker versioning so old histories replay against the code that produced them; LangGraph and XState snapshots need their state shape to stay compatible, or a migration function on load.

### What is event sourcing, and when would you avoid it? {deep}

Event sourcing stores the sequence of events that happened to an entity, rather than its current state, and derives the state by replaying them. You get a complete audit trail, the ability to build new read models later, and natural support for "what happened in this run?" timelines in the UI.

I would avoid it where an audit table and a current-state row are enough, because it brings costs: events are a contract you version forever, rebuilding state needs snapshots once histories get long, queries need separate read models (CQRS), and the team has to learn a different way of working.

### How would you use a state machine in the front end of this platform?

For the chat and run UI, whose states really are exclusive: idle, sending, streaming, awaiting approval, error, cancelled. With a statechart, the "Stop" button only exists in streaming, a new message cannot be sent while awaiting approval, and an error state knows whether to offer retry. That replaces several booleans that could disagree.

XState works in React through its React bindings, or a plain reducer with a discriminated-union state does the same for smaller cases. Either way the server remains the source of truth for the run's state, and the UI machine mirrors the events it streams.

### How do you show a workflow's state on a live dashboard?

Every transition emits an event (run id, from, to, event, timestamp, sequence number) to a channel keyed by run, and appends it to the run's event log. The dashboard subscribes over SSE or a WebSocket and applies events in order, using the sequence number to detect gaps and resync from a snapshot endpoint.

Because the state machine has a fixed set of states, the dashboard can show counts per state, how long runs sit in each state, and alerts for runs stuck past a threshold in `awaiting_approval` or `running_tool`.

### How do you test a state machine?

Table-driven tests over the transition function: every allowed transition produces the right state and effects, every disallowed one is rejected, guards behave at their boundaries, and final states accept nothing. Because transitions are pure, these tests need no mocks.

Then test time with a simulated clock (XState's `SimulatedClock`, Temporal's time-skipping test environment), and test resume: persist a snapshot mid-run, restore it, and continue. Model-based testing can also generate a path to every reachable state from the machine definition, so new states are covered automatically.

## Coding problems

### Validate a sequence of run events {easy core}

Given the transition table below and a list of events, return the final state if every event is allowed, or the index of the first invalid event and the state the run was in at that point.

```text
TRANSITIONS = {("queued","start"): "running", ("running","pause"): "paused",
               ("paused","resume"): "running", ("running","finish"): "done"}
validate(["start", "pause", "resume", "finish"]) → ("done", None)
validate(["start", "finish", "pause"])           → ("done", 2)
```

#### Hints

1. Walk the events, keeping the current state, starting at "queued".
2. Look up `(state, event)` in the table. A missing key means the event is invalid at this point.

#### Solution

One pass with a dict lookup per event. Returning the index makes the error useful: "event 2 (pause) is not allowed in state done".

```python
TRANSITIONS = {
    ("queued", "start"): "running",
    ("running", "pause"): "paused",
    ("paused", "resume"): "running",
    ("running", "finish"): "done",
}


def validate(events: list[str], start: str = "queued") -> tuple[str, int | None]:
    state = start
    for i, event in enumerate(events):
        nxt = TRANSITIONS.get((state, event))
        if nxt is None:
            return state, i
        state = nxt
    return state, None


assert validate(["start", "pause", "resume", "finish"]) == ("done", None)
assert validate(["start", "finish", "pause"]) == ("done", 2)
assert validate([]) == ("queued", None)
assert validate(["resume"]) == ("queued", 0)
```

Complexity: O(n) time, O(1) extra space.

#### Follow-ups

- **How would you report every error, not just the first?** Decide whether an invalid event is skipped or stops processing; for an audit report you might skip it, record it and continue.
- **How would you add a guard, such as "finish only if all steps are done"?** Store a guard function next to the target state and evaluate it with the run's context before transitioning.

### Remind and expire pending approvals {medium}

Runs waiting for approval must get one reminder when half their timeout has passed, and must expire when the whole timeout has passed. Write `tick(runs, now)`, called every minute by a scheduler, that returns the updated runs and a list of actions (`remind` or `expire`). It must be idempotent: calling it twice at the same time must not send a second reminder.

```text
run: { id: 'r1', state: 'awaiting_approval', requestedAt: 0, timeoutMs: 60 min, remindedAt: null }
tick at 10 min → no actions
tick at 30 min → remind r1
tick at 31 min → no actions (already reminded)
tick at 60 min → expire r1
```

#### Hints

1. Only runs in `awaiting_approval` matter. Compute the elapsed time from `requestedAt`.
2. Check expiry before the reminder: a run past its deadline should expire, not be reminded.
3. Record `remindedAt` on the run, and remind only when it is still null. That is what makes `tick` idempotent.

#### Solution

The scheduler may fire late, early or twice, so the function compares against stored facts (`remindedAt`, `requestedAt`) rather than assuming it runs exactly once at the right moment. It returns new objects instead of mutating, so the caller can save them with a version check.

```ts
import assert from 'node:assert/strict';

type Run = {
  id: string;
  state: 'awaiting_approval' | 'running' | 'expired';
  requestedAt: number;
  timeoutMs: number;
  remindedAt: number | null;
};
type Action = { type: 'remind' | 'expire'; runId: string };

function tick(runs: Run[], now: number): { runs: Run[]; actions: Action[] } {
  const actions: Action[] = [];
  const next = runs.map((run): Run => {
    if (run.state !== 'awaiting_approval') return run;
    const elapsed = now - run.requestedAt;
    if (elapsed >= run.timeoutMs) {
      actions.push({ type: 'expire', runId: run.id });
      return { ...run, state: 'expired' };
    }
    if (elapsed >= run.timeoutMs / 2 && run.remindedAt === null) {
      actions.push({ type: 'remind', runId: run.id });
      return { ...run, remindedAt: now };
    }
    return run;
  });
  return { runs: next, actions };
}

const MIN = 60_000;
let runs: Run[] = [
  { id: 'r1', state: 'awaiting_approval', requestedAt: 0, timeoutMs: 60 * MIN, remindedAt: null },
  { id: 'r2', state: 'running', requestedAt: 0, timeoutMs: 60 * MIN, remindedAt: null },
];
const at = (minutes: number) => {
  const result = tick(runs, minutes * MIN);
  runs = result.runs;
  return result.actions;
};

assert.deepEqual(at(10), []);
assert.deepEqual(at(30), [{ type: 'remind', runId: 'r1' }]);
assert.deepEqual(at(30), []); // the scheduler fired twice: no second reminder
assert.deepEqual(at(31), []);
assert.deepEqual(at(60), [{ type: 'expire', runId: 'r1' }]);
assert.deepEqual(at(61), []);
assert.equal(runs[0].state, 'expired');
assert.equal(runs[1].state, 'running'); // untouched

// A scheduler outage: the first tick after the deadline expires the run without reminding it.
runs = [{ id: 'r3', state: 'awaiting_approval', requestedAt: 0, timeoutMs: 60 * MIN, remindedAt: null }];
assert.deepEqual(at(90), [{ type: 'expire', runId: 'r3' }]);
```

Complexity: O(n) per tick.

#### Follow-ups

- **How would this scale to a million pending runs?** Do not scan them all: index on the deadline (`WHERE state = 'awaiting_approval' AND expires_at <= now()`), or schedule one Cloud Tasks task per run for its reminder and its expiry.
- **What if the approval and the expiry race?** Both go through the versioned save, so exactly one wins, and the loser re-reads the state.

### Run a saga whose compensations can fail {medium}

Extend the saga runner: each compensation is retried up to `retries` times. If a compensation still fails, record it and keep compensating the remaining steps, then return status `"needs_manual_intervention"` with the names of the steps that could not be undone. Return `"completed"` when every step succeeds and `"compensated"` when a step fails and every compensation succeeds.

#### Hints

1. Keep the forward loop from the basic saga. The change is all in the compensation loop.
2. Wrap each compensation in its own retry loop, so one stubborn compensation does not stop the others.
3. Collect the names of compensations that never succeeded. Their presence decides the final status.

#### Solution

Stopping at the first failed compensation would leave even more steps un-compensated. So compensate everything you can, retry each one a few times (compensations must be idempotent for this to be safe), and escalate precisely the ones that are left.

```python
from collections.abc import Callable

Step = tuple[str, Callable[[], None], Callable[[], None]]


def run_saga(steps: list[Step], retries: int = 3) -> tuple[str, list[str]]:
    completed: list[Step] = []
    for step in steps:
        try:
            step[1]()
        except Exception:
            break
        completed.append(step)
    else:
        return "completed", []

    stuck: list[str] = []
    for name, _, compensate in reversed(completed):
        for _ in range(retries):
            try:
                compensate()
                break
            except Exception:
                continue
        else:
            stuck.append(name)  # every retry failed
    return ("needs_manual_intervention", stuck) if stuck else ("compensated", [])


attempts = {"cancel_po": 0}


def cancel_po_flaky() -> None:
    attempts["cancel_po"] += 1
    if attempts["cancel_po"] < 3:
        raise ConnectionError("SAP timeout")


def fail() -> None:
    raise RuntimeError("step failed")


def noop() -> None:
    pass


assert run_saga([("a", noop, noop), ("b", noop, noop)]) == ("completed", [])
assert run_saga([("reserve", noop, noop), ("create_po", noop, cancel_po_flaky), ("attach", fail, noop)]) == ("compensated", [])
assert attempts["cancel_po"] == 3  # succeeded on the third try

released: list[str] = []
result = run_saga(
    [
        ("reserve", noop, lambda: released.append("budget")),
        ("create_po", noop, fail),  # can never be undone automatically
        ("attach", fail, noop),
    ]
)
assert result == ("needs_manual_intervention", ["create_po"])
assert released == ["budget"]  # still compensated the earlier step
```

Complexity: O(n × retries) calls in the worst case.

#### Follow-ups

- **Should retries happen immediately?** No: add backoff with jitter, and make the saga's own state persistent so compensation continues after a crash.
- **What does the operator need to see?** The saga id, each step's status (done, compensated, stuck), the last error per step and a button to retry the stuck compensation once the external system is fixed.
