---
title: Python live coding for backend services
goal: Solve the practical Python tasks a backend round asks for (bounded queues, retries, rate limits, caches, state machines, stream parsing) with clean, tested, async-aware code.
minutes: 110
---

When the interviewer says "pick Python or TypeScript" for the backend part, these are the tasks you are most likely to
get: small, realistic pieces of an orchestration service. They test whether you can write correct async code, keep
time and randomness under control so the code is testable, and handle the edge cases a production service meets:
full queues, failing calls, expired entries, out-of-order events, half-received network chunks.

Every solution injects its clock, sleep function or random source. Say why when you do it: it makes the code
deterministic to test, and interviewers notice. Each block runs on Python 3.14 with its own asserts.

## The toolkit you will reach for

| Need | Tool |
|---|---|
| Work queue with backpressure | `asyncio.Queue(maxsize=n)` |
| At most n things at once | `asyncio.Semaphore(n)` |
| Run tasks, cancel the rest if one fails | `asyncio.TaskGroup` (3.11+) |
| Deadline around a block | `async with asyncio.timeout(seconds)` (3.11+) |
| First of several to finish | `asyncio.wait(…, return_when=FIRST_COMPLETED)` |
| Blocking call from async code | `await asyncio.to_thread(fn, …)` |
| Elapsed time, rate limits, TTLs | `time.monotonic()` (never wall-clock time) |
| LRU order | `collections.OrderedDict` with `move_to_end` and `popitem(last=False)` |
| Top k | `heapq.nlargest`, or a size-k min-heap for a stream |
| Fixed-size chunks | `itertools.batched` (3.12+) |
| Typed records | `@dataclass(frozen=True, slots=True)` |

```python
import asyncio
import itertools
import time
from collections import OrderedDict


async def main() -> list[int]:
    limit = asyncio.Semaphore(2)

    async def job(i: int) -> int:
        async with limit:
            await asyncio.sleep(0.001)
            return i * i

    async with asyncio.timeout(1):
        async with asyncio.TaskGroup() as tg:
            tasks = [tg.create_task(job(i)) for i in range(5)]
    return [t.result() for t in tasks]


assert asyncio.run(main()) == [0, 1, 4, 9, 16]
assert list(itertools.batched("abcde", 2)) == [("a", "b"), ("c", "d"), ("e",)]

lru = OrderedDict(a=1, b=2, c=3)
lru.move_to_end("a")                       # "a" is now the most recently used
assert lru.popitem(last=False) == ("b", 2)  # evict the least recently used

start = time.monotonic()
assert time.monotonic() >= start           # monotonic never goes backwards
```

## Interview questions

### `asyncio.gather` or `asyncio.TaskGroup`? {core}

`TaskGroup` is the structured choice since Python 3.11: if any task fails, the group cancels the others, waits for
them, and raises an `ExceptionGroup`, so nothing keeps running in the background. `gather` returns results in input
order and is handy with `return_exceptions=True` when you want every outcome, but on failure it raises the first
exception and leaves the other tasks running unless you cancel them yourself.

### Why `time.monotonic()`, and why inject the clock?

Wall-clock time can jump backwards or forwards (NTP corrections, daylight saving, a manual change), which would break
a rate limiter or a TTL. `monotonic()` only moves forward, so it is the right source for durations. Injecting it as a
parameter lets tests drive time with a fake clock, so a test of "expires after 30 seconds" runs instantly and never
flakes.

### What happens if you call a blocking function inside `async def`? {core}

It blocks the whole event loop: every other request, stream and timer on that worker freezes until it returns. Use
the async version of the library, or move the call to a thread with `await asyncio.to_thread(fn, ...)`. CPU-heavy work
needs a process pool or another service, because threads still share the GIL on the default build.

### How do you call an external API safely from many concurrent tasks? {core}

Three controls. A semaphore caps concurrency so you never open more connections than the API or your pool allows. A
rate limiter (token bucket) caps requests per second to stay under the provider's quota. A retry with exponential
backoff and jitter handles transient failures, retrying only on errors that are safe to retry (timeouts, 429, 503),
and honouring `Retry-After` when the server sends it.

### What does `functools.wraps` do, and why does it matter for decorators?

It copies the wrapped function's `__name__`, `__doc__`, `__module__`, `__qualname__` and `__wrapped__` onto the
wrapper. Without it, every decorated function looks like `wrapper` in logs, tracebacks, FastAPI's OpenAPI output and
`inspect.signature`, which makes debugging and introspection harder.

### When do you use a generator instead of building a list? {deep}

When the data is large, unbounded or arrives over time: log files, paginated API results, a token stream. A generator
holds one item at a time and starts producing results immediately, and generators chain into lazy pipelines. Build a
list when you need its length, random access, or to iterate it more than once.

## Coding problems

### Bounded producer and consumers with asyncio {medium core}

Process a list of jobs with a fixed number of async workers and a bounded queue, so the producer slows down when the
workers fall behind. One failing job must not stop the others. Return the results, the errors and the largest queue
size seen.

#### Hints

1. `asyncio.Queue(maxsize=n)` makes `await queue.put(x)` wait while the queue is full. That is your backpressure.
2. Start one producer and N workers. How does each worker know there is no more work?
3. Put one unique stop marker per worker on the queue after the real jobs. Catch exceptions per job inside the worker.

#### Solution

The producer awaits `put`, so it can never run more than `maxsize` jobs ahead. Each worker loops until it takes the
stop marker. A plain `object()` is used as the marker so that any real value, including `None`, can be a job. The
`TaskGroup` waits for everything and would cancel the rest if a worker itself crashed.

```python
import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

_STOP = object()


@dataclass
class Outcome:
    results: dict[int, int] = field(default_factory=dict)
    errors: dict[int, str] = field(default_factory=dict)
    peak_queue: int = 0


async def process_all(jobs: list[int], handler: Callable[[int], Awaitable[int]], workers: int = 3, maxsize: int = 2) -> Outcome:
    queue: asyncio.Queue[object] = asyncio.Queue(maxsize=maxsize)
    outcome = Outcome()

    async def producer() -> None:
        for job in jobs:
            await queue.put(job)  # waits while the queue is full
            outcome.peak_queue = max(outcome.peak_queue, queue.qsize())
        for _ in range(workers):
            await queue.put(_STOP)

    async def worker() -> None:
        while (job := await queue.get()) is not _STOP:
            assert isinstance(job, int)
            try:
                outcome.results[job] = await handler(job)
            except Exception as exc:
                outcome.errors[job] = repr(exc)

    async with asyncio.TaskGroup() as tg:
        tg.create_task(producer())
        for _ in range(workers):
            tg.create_task(worker())
    return outcome


async def double(job: int) -> int:
    await asyncio.sleep(0.001 * (job % 3))
    if job == 3:
        raise TimeoutError("tool call timed out")
    return job * 2


out = asyncio.run(process_all(list(range(10)), double, workers=3, maxsize=2))
assert out.results == {i: i * 2 for i in range(10) if i != 3}
assert out.errors == {3: "TimeoutError('tool call timed out')"}
assert out.peak_queue <= 2

empty = asyncio.run(process_all([], double))
assert empty.results == {} and empty.errors == {}
```

Complexity: O(n) work; memory is bounded by `maxsize` plus one job per worker.

#### Follow-ups

- **Another way to stop the workers?** `await queue.join()` (needs `task_done()` after each job), then cancel the
  worker tasks.
- **Retries for failed jobs?** Re-queue with an attempt count, and send jobs over the limit to a dead-letter list.

### Retry decorator for sync and async functions {medium core}

Write `@retry(attempts=..., base_delay=..., retry_on=(...))` that retries a function on the listed exceptions with
exponential backoff and jitter. It must work on both `def` and `async def` functions, re-raise the last error when
attempts run out, and not retry other exceptions.

#### Hints

1. A decorator with arguments is a function that returns a decorator.
2. `inspect.iscoroutinefunction(fn)` tells you which wrapper to return: an async one must `await` and use
   `asyncio.sleep`, never `time.sleep`.
3. Full jitter: sleep a random amount between 0 and `min(max_delay, base_delay * 2 ** (attempt - 1))`. Inject the sleep
   and random functions so the test can record delays.

#### Solution

Two wrappers sharing one delay rule. Jitter spreads retries from many clients over time, so they do not all hit a
recovering service at the same instant. `functools.wraps` keeps the function's name and signature.

```python
import asyncio
import functools
import inspect
import random
import time
from collections.abc import Awaitable, Callable


def retry(
    *,
    attempts: int = 3,
    base_delay: float = 0.1,
    max_delay: float = 5.0,
    retry_on: tuple[type[BaseException], ...] = (Exception,),
    sleep: Callable[[float], None] = time.sleep,
    async_sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    rand: Callable[[], float] = random.random,
):
    if attempts < 1:
        raise ValueError("attempts must be at least 1")

    def delay(attempt: int) -> float:
        return rand() * min(max_delay, base_delay * 2 ** (attempt - 1))

    def decorate(fn):
        if inspect.iscoroutinefunction(fn):
            @functools.wraps(fn)
            async def async_wrapper(*args, **kwargs):
                for attempt in range(1, attempts + 1):
                    try:
                        return await fn(*args, **kwargs)
                    except retry_on:
                        if attempt == attempts:
                            raise
                        await async_sleep(delay(attempt))

            return async_wrapper

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except retry_on:
                    if attempt == attempts:
                        raise
                    sleep(delay(attempt))

        return wrapper

    return decorate


# Sync: fails twice, then succeeds. rand=1.0 makes the delays the upper bounds.
delays: list[float] = []
calls = {"n": 0}


@retry(attempts=4, base_delay=0.1, retry_on=(ConnectionError,), sleep=delays.append, rand=lambda: 1.0)
def fetch_status() -> str:
    """Fetch the run status."""
    calls["n"] += 1
    if calls["n"] < 3:
        raise ConnectionError("reset")
    return "ok"


assert fetch_status() == "ok"
assert calls["n"] == 3 and delays == [0.1, 0.2]
assert fetch_status.__name__ == "fetch_status" and fetch_status.__doc__ == "Fetch the run status."


@retry(attempts=3, retry_on=(ConnectionError,), sleep=lambda s: None)
def bad_request() -> None:
    raise ValueError("400: not retryable")


try:
    bad_request()
    raise AssertionError("should raise")
except ValueError:
    pass


@retry(attempts=2, sleep=lambda s: None)
def always_down() -> None:
    raise ConnectionError("down")


try:
    always_down()
    raise AssertionError("should raise")
except ConnectionError as exc:
    assert str(exc) == "down"  # the last error is re-raised


# Async: same behaviour with an awaited sleep.
async_delays: list[float] = []


async def record(seconds: float) -> None:
    async_delays.append(seconds)


attempts_seen = {"n": 0}


@retry(attempts=3, base_delay=0.5, async_sleep=record, rand=lambda: 0.5)
async def call_model() -> str:
    attempts_seen["n"] += 1
    if attempts_seen["n"] == 1:
        raise TimeoutError
    return "tokens"


assert asyncio.run(call_model()) == "tokens"
assert async_delays == [0.25]
assert inspect.iscoroutinefunction(call_model)
```

Complexity: O(attempts) calls; the backoff caps total waiting time.

#### Follow-ups

- **Honour `Retry-After` from a 429?** Let the exception carry the server's delay, and sleep `max(server_delay, delay)`.
- **Is retrying a POST safe?** Only if the operation is idempotent, for example with an idempotency key the server
  deduplicates on.

### Token-bucket rate limiter {medium core}

Write a rate limiter that allows bursts up to `capacity` requests and refills at `rate` tokens per second. `allow()`
returns whether a request may go now, and `retry_after()` says how long until it could.

#### Hints

1. You do not need a background timer. Refill lazily: when a request arrives, add `elapsed × rate` tokens, capped at
   the capacity.
2. Use a monotonic clock, injected so the test can control time.
3. For `retry_after`, ask how many tokens are missing and how fast they arrive. What if the cost is larger than the
   capacity?

#### Solution

Store the token count and the time it was last updated. Each call refills, then spends if it can. Floats are fine
because the refill is proportional to elapsed time.

```python
import math
import time
from collections.abc import Callable


class TokenBucket:
    def __init__(self, rate: float, capacity: float, clock: Callable[[], float] = time.monotonic) -> None:
        if rate <= 0 or capacity <= 0:
            raise ValueError("rate and capacity must be positive")
        self.rate = rate
        self.capacity = capacity
        self.clock = clock
        self.tokens = capacity
        self.updated = clock()

    def _refill(self) -> None:
        now = self.clock()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now

    def allow(self, cost: float = 1.0) -> bool:
        self._refill()
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False

    def retry_after(self, cost: float = 1.0) -> float:
        if cost > self.capacity:
            return math.inf  # waiting will never help: the bucket cannot hold that many tokens
        self._refill()
        return max(0.0, (cost - self.tokens) / self.rate)


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


clock = FakeClock()
bucket = TokenBucket(rate=1.0, capacity=3, clock=clock)
assert [bucket.allow() for _ in range(4)] == [True, True, True, False]  # burst of 3
assert bucket.retry_after() == 1.0
clock.now += 0.5
assert bucket.allow() is False  # only half a token
clock.now += 0.5
assert bucket.allow() is True
clock.now += 100
assert bucket.tokens <= 3 and [bucket.allow() for _ in range(4)] == [True, True, True, False]  # capped
assert bucket.allow(cost=5) is False  # more than the bucket can ever hold
assert bucket.retry_after(cost=5) == math.inf

try:
    TokenBucket(rate=0, capacity=1)
    raise AssertionError("should raise")
except ValueError:
    pass
```

Complexity: O(1) time and space per call.

#### Follow-ups

- **Per client?** A dict from client id to bucket, with idle buckets evicted (a TTL cache works).
- **Across many server instances?** Keep the bucket in Redis and update it atomically with a Lua script.

### Run coroutines with a concurrency limit {medium core}

Given a list of async job factories (functions that return an awaitable), run them with at most `limit` in flight and
return the results in input order. Then write a strict version that cancels the remaining jobs as soon as one fails.

#### Hints

1. `asyncio.Semaphore(limit)` around each job caps how many run at once.
2. `asyncio.gather` keeps input order in its result list.
3. For the strict version, create the tasks inside an `asyncio.TaskGroup`: a failure cancels the siblings, including
   those still waiting for the semaphore.

#### Solution

Factories rather than coroutine objects: nothing is created until there is a slot, and a factory can be called again
for a retry. The test measures the peak number of jobs running at once.

```python
import asyncio
import random
from collections.abc import Awaitable, Callable


async def gather_limited[T](factories: list[Callable[[], Awaitable[T]]], limit: int) -> list[T]:
    if limit < 1:
        raise ValueError("limit must be at least 1")
    semaphore = asyncio.Semaphore(limit)

    async def run(factory: Callable[[], Awaitable[T]]) -> T:
        async with semaphore:
            return await factory()

    return await asyncio.gather(*(run(f) for f in factories))


async def gather_limited_strict[T](factories: list[Callable[[], Awaitable[T]]], limit: int) -> list[T]:
    semaphore = asyncio.Semaphore(limit)

    async def run(factory: Callable[[], Awaitable[T]]) -> T:
        async with semaphore:
            return await factory()

    async with asyncio.TaskGroup() as tg:
        tasks = [tg.create_task(run(f)) for f in factories]
    return [t.result() for t in tasks]


active = peak = 0


def make_job(i: int) -> Callable[[], Awaitable[int]]:
    async def job() -> int:
        global active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(random.uniform(0, 0.005))
        active -= 1
        return i

    return job


assert asyncio.run(gather_limited([make_job(i) for i in range(12)], limit=3)) == list(range(12))
assert peak == 3
assert asyncio.run(gather_limited([], limit=2)) == []

started: list[int] = []


def flaky(i: int) -> Callable[[], Awaitable[int]]:
    async def job() -> int:
        started.append(i)
        await asyncio.sleep(0.005)
        if i == 1:
            raise RuntimeError("tool failed")
        return i

    return job


try:
    asyncio.run(gather_limited_strict([flaky(i) for i in range(10)], limit=2))
    raise AssertionError("should raise")
except* RuntimeError as group:
    assert [str(e) for e in group.exceptions] == ["tool failed"]
assert len(started) < 10  # the rest were cancelled before they started
```

Complexity: O(n) tasks; at most `limit` run at once.

#### Follow-ups

- **Millions of jobs?** Do not create a task per job up front. Use N worker tasks pulling from a bounded queue (the
  first problem).
- **Per-host limits?** A dict of semaphores keyed by host.

### LRU cache with a time-to-live {medium core}

Build a cache with a maximum number of entries and a TTL. `get` returns a default for missing or expired keys, and
counts as a use. When full, `put` evicts the least recently used entry.

#### Hints

1. `OrderedDict` keeps order: `move_to_end(key)` on every use, `popitem(last=False)` to evict the oldest.
2. Store the expiry time with the value, and check it on `get` (lazy expiry).
3. Edge cases: capacity 0, overwriting an existing key, a key that expires exactly now.

#### Solution

Each entry stores `(expires_at, value)`. `get` deletes an expired entry when it finds one, so expired entries never
come back. `purge()` sweeps every expired entry for callers that want memory back sooner.

```python
import time
from collections import OrderedDict
from collections.abc import Callable, Hashable


class TTLCache[K: Hashable, V]:
    def __init__(self, capacity: int, ttl: float, clock: Callable[[], float] = time.monotonic) -> None:
        if capacity < 0 or ttl <= 0:
            raise ValueError("capacity must be >= 0 and ttl > 0")
        self.capacity = capacity
        self.ttl = ttl
        self.clock = clock
        self._data: OrderedDict[K, tuple[float, V]] = OrderedDict()

    def get(self, key: K, default: V | None = None) -> V | None:
        entry = self._data.get(key)
        if entry is None:
            return default
        expires_at, value = entry
        if self.clock() >= expires_at:
            del self._data[key]
            return default
        self._data.move_to_end(key)
        return value

    def put(self, key: K, value: V) -> None:
        if self.capacity == 0:
            return
        if key in self._data:
            self._data.move_to_end(key)
        self._data[key] = (self.clock() + self.ttl, value)
        while len(self._data) > self.capacity:
            self._data.popitem(last=False)

    def purge(self) -> int:
        now = self.clock()
        expired = [k for k, (expires_at, _) in self._data.items() if now >= expires_at]
        for k in expired:
            del self._data[k]
        return len(expired)

    def __len__(self) -> int:
        return len(self._data)


class FakeClock:
    now = 0.0

    def __call__(self) -> float:
        return self.now


clock = FakeClock()
cache: TTLCache[str, int] = TTLCache(capacity=2, ttl=10, clock=clock)
cache.put("a", 1)
cache.put("b", 2)
assert cache.get("a") == 1          # "a" is now most recent
cache.put("c", 3)                   # evicts "b", the least recently used
assert cache.get("b") is None and cache.get("a") == 1 and cache.get("c") == 3

clock.now = 5.0
cache.put("a", 10)                  # overwrite refreshes the value and the expiry (now 15.0)
clock.now = 9.9
assert cache.get("a") == 10 and cache.get("c") == 3
clock.now = 10.0
assert cache.get("c", -1) == -1     # "c" was written at 0.0, so it expires exactly at 10.0
assert cache.get("a") == 10         # still alive until 15.0
clock.now = 20.0
assert len(cache) == 1 and cache.purge() == 1 and len(cache) == 0

zero: TTLCache[str, int] = TTLCache(capacity=0, ttl=1, clock=clock)
zero.put("x", 1)
assert zero.get("x") is None and len(zero) == 0
```

Complexity: O(1) average for `get` and `put`; `purge` is O(n).

#### Follow-ups

- **Evict expired entries before live ones when full?** Keep a second structure ordered by expiry (a heap with lazy
  deletion), and pop expired entries first.
- **Thread-safe?** Guard every method with a `threading.Lock`; in asyncio a single event loop needs no lock if no
  method awaits.

### Agent-run state machine {medium core}

Model an agent run with states `queued`, `running`, `waiting_approval`, `succeeded`, `failed` and `cancelled`. Events
move it between states; anything not allowed must raise. A failed run may be retried, but only up to a limit. Keep a
history of transitions.

#### Hints

1. A transition table `{(state, event): next_state}` is clearer and easier to test than nested `if` statements.
2. Terminal states have no outgoing transitions, apart from `retry` on `failed`.
3. Put the retry limit in a guard that runs before the transition is applied.

#### Solution

The table is the single source of truth, so the allowed moves are easy to review. `send` checks the table, applies the
guard, records history, and returns the new state. Invalid events raise a specific exception that the API layer can
turn into a 409 Conflict.

```python
from dataclasses import dataclass, field
from enum import StrEnum


class State(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_APPROVAL = "waiting_approval"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


TRANSITIONS: dict[tuple[State, str], State] = {
    (State.QUEUED, "start"): State.RUNNING,
    (State.QUEUED, "cancel"): State.CANCELLED,
    (State.RUNNING, "need_approval"): State.WAITING_APPROVAL,
    (State.RUNNING, "finish"): State.SUCCEEDED,
    (State.RUNNING, "fail"): State.FAILED,
    (State.RUNNING, "cancel"): State.CANCELLED,
    (State.WAITING_APPROVAL, "approve"): State.RUNNING,
    (State.WAITING_APPROVAL, "reject"): State.CANCELLED,
    (State.WAITING_APPROVAL, "cancel"): State.CANCELLED,
    (State.FAILED, "retry"): State.QUEUED,
}


class InvalidTransition(Exception):
    pass


@dataclass
class AgentRun:
    max_attempts: int = 3
    state: State = State.QUEUED
    attempts: int = 1
    history: list[tuple[State, str, State]] = field(default_factory=list)

    def send(self, event: str) -> State:
        target = TRANSITIONS.get((self.state, event))
        if target is None:
            raise InvalidTransition(f"cannot {event!r} a run that is {self.state}")
        if event == "retry":
            if self.attempts >= self.max_attempts:
                raise InvalidTransition(f"no attempts left ({self.attempts}/{self.max_attempts})")
            self.attempts += 1
        self.history.append((self.state, event, target))
        self.state = target
        return target


run = AgentRun()
for event in ["start", "need_approval", "approve", "finish"]:
    run.send(event)
assert run.state is State.SUCCEEDED
assert run.history[1] == (State.RUNNING, "need_approval", State.WAITING_APPROVAL)

try:
    run.send("start")  # terminal
    raise AssertionError("should raise")
except InvalidTransition as exc:
    assert "succeeded" in str(exc)

flaky = AgentRun(max_attempts=2)
flaky.send("start")
flaky.send("fail")
flaky.send("retry")
flaky.send("start")
flaky.send("fail")
try:
    flaky.send("retry")  # second retry would be attempt 3 of 2
    raise AssertionError("should raise")
except InvalidTransition:
    assert flaky.state is State.FAILED and flaky.attempts == 2

rejected = AgentRun()
rejected.send("start")
rejected.send("need_approval")
assert rejected.send("reject") is State.CANCELLED
```

Complexity: O(1) per event.

#### Follow-ups

- **Two workers send events at the same time?** Persist the state with optimistic concurrency: `UPDATE runs SET
  state = :next, version = version + 1 WHERE id = :id AND state = :current AND version = :version`, and treat zero rows
  updated as a conflict.
- **Side effects such as notifying the approver?** Emit an event after the state change is committed (an outbox
  table), not inside `send`.

### Parse a Server-Sent Events stream from chunks {medium core}

Write an incremental parser for a `text/event-stream` body. Network chunks can split anywhere, even between `\r` and
`\n`. Support `data` (multiple lines joined with `\n`), `event` (default `"message"`), `id` (remembered for later events),
`retry`, and comments starting with `:`. An event is dispatched at a blank line, and only if it has data.

#### Hints

1. Keep a buffer. Only process complete lines; keep the incomplete tail for the next chunk.
2. Lines can end with `\r\n`, `\n` or `\r`. A `\r` at the very end of a chunk is ambiguous: treat the line as ended, and
   skip a `\n` if it starts the next chunk.
3. Split each line at the first colon, and remove one leading space from the value. Test by feeding the same stream
   split at every position.

#### Solution

The parser follows the WHATWG rules for event streams: field names `data`, `event`, `id` and `retry`; one optional
space after the colon; a line without a colon is a field with an empty value; an `id` containing NUL is ignored; an
event with no data lines is dropped, but its `event` type is still reset. One subtle rule matters for reconnecting:
an `id:` line only fills a buffer, and the **last event ID used for `Last-Event-ID` is committed at the blank line**,
even when the event has no data. If the connection drops in the middle of event 5, the client must resume after
event 4, not 5. The test proves chunk boundaries do not matter by splitting the stream at every possible index
(including empty chunks) and feeding it one character at a time.

```python
import re
from dataclasses import dataclass

LINE_END = re.compile(r"\r\n|\r|\n")


@dataclass(frozen=True)
class Event:
    data: str
    event: str = "message"
    id: str | None = None


class SSEParser:
    def __init__(self) -> None:
        self.buffer = ""
        self.at_start = True
        self.skip_lf = False
        self.data: list[str] = []
        self.event_type = ""
        self.id_buffer: str | None = None
        self.last_event_id: str | None = None  # committed at each blank line; send it as Last-Event-ID
        self.retry: int | None = None

    def feed(self, chunk: str) -> list[Event]:
        if not chunk:
            return []  # an empty read must not clear the pending "\r" state
        if self.at_start:
            chunk = chunk.removeprefix("\ufeff")  # one leading byte-order mark is ignored
            self.at_start = False
        if self.skip_lf and chunk.startswith("\n"):
            chunk = chunk[1:]
        self.skip_lf = False
        self.buffer += chunk
        events: list[Event] = []
        while match := LINE_END.search(self.buffer):
            if match.group() == "\r" and match.end() == len(self.buffer):
                self.skip_lf = True  # a "\n" may arrive at the start of the next chunk
            line = self.buffer[: match.start()]
            self.buffer = self.buffer[match.end():]
            event = self._line(line)
            if event:
                events.append(event)
        return events

    def _line(self, line: str) -> Event | None:
        if line == "":
            self.last_event_id = self.id_buffer  # set before the empty-data check, as the spec says
            data, event_type = self.data, self.event_type
            self.data, self.event_type = [], ""
            if not data:
                return None
            return Event("\n".join(data), event_type or "message", self.id_buffer)
        if line.startswith(":"):
            return None  # comment, often a keep-alive
        name, _, value = line.partition(":")
        if value.startswith(" "):
            value = value[1:]
        if name == "data":
            self.data.append(value)
        elif name == "event":
            self.event_type = value
        elif name == "id" and "\0" not in value:
            self.id_buffer = value
        elif name == "retry" and value.isascii() and value.isdigit():
            self.retry = int(value)
        return None


STREAM = (
    ": keep-alive\n"
    "retry: 3000\n"
    "id: 1\nevent: token\ndata: Hel\n\n"
    "id: 2\nevent: token\ndata: lo\n\n"
    "data: line one\ndata: line two\n\n"
    "data\n\n"
    "event: done\n\n"
    'data: {"ok": true}\n\n'
    "data:no space\n\n"
    "data:  two spaces\n\n"
    "id: bad\0id\ndata: x\n\n"
    "data: never finished\n"
)
EXPECTED = [
    Event("Hel", "token", "1"),
    Event("lo", "token", "2"),
    Event("line one\nline two", "message", "2"),
    Event("", "message", "2"),
    Event('{"ok": true}', "message", "2"),  # the data-less "done" block reset the type
    Event("no space", "message", "2"),
    Event(" two spaces", "message", "2"),
    Event("x", "message", "2"),  # an id containing NUL is ignored
]


def parse_in_pieces(text: str, cuts: list[int]) -> tuple[list[Event], SSEParser]:
    parser = SSEParser()
    events: list[Event] = []
    for start, end in zip([0, *cuts], [*cuts, len(text)]):
        events += parser.feed(text[start:end])
    return events, parser


events, parser = parse_in_pieces(STREAM, [])
assert events == EXPECTED and parser.retry == 3000
for newline in ["\r\n", "\r"]:
    variant = STREAM.replace("\n", newline)
    for cut in range(len(variant) + 1):
        assert parse_in_pieces(variant, [cut])[0] == EXPECTED, (repr(newline), cut)
        assert parse_in_pieces(variant, [cut, cut])[0] == EXPECTED  # an empty chunk at the cut
    assert parse_in_pieces(variant, list(range(1, len(variant))))[0] == EXPECTED  # one char at a time

# Resume point: an unfinished event must not move it; a data-less event with an id does.
p = SSEParser()
assert p.feed("id: 1\ndata: a\n\nid: 2\ndata: b") == [Event("a", "message", "1")]
assert p.last_event_id == "1"  # event 2 is incomplete, so a reconnect resumes after 1
assert p.feed("\n\n") == [Event("b", "message", "2")] and p.last_event_id == "2"
assert p.feed("id: 3\n\n") == [] and p.last_event_id == "3"
assert SSEParser().feed("\ufeffdata: hi\n\n") == [Event("hi")]
```

Complexity: O(n) over the stream (each character is scanned a constant number of times per chunk; with very many tiny
chunks, keep the buffer as a list to avoid repeated string concatenation).

#### Follow-ups

- **Bytes instead of text?** Decode with an incremental UTF-8 decoder (`codecs.getincrementaldecoder("utf-8")()`), so a
  multi-byte character split across chunks is not corrupted.
- **Reconnect?** Send `last_event_id` in the `Last-Event-ID` header, and wait `retry` milliseconds first. The server
  replays every event after that id, so the client must also tolerate a duplicate if the server's log is at-least-once.

### Merge execution windows and total busy time {medium}

Given `(start, end)` execution windows from many workers (in seconds, unsorted, possibly overlapping), return the merged
busy windows, the total busy time, and the idle gaps between them.

`[(5, 8), (1, 3), (2, 4), (10, 12)]` → busy `[(1, 4), (5, 8), (10, 12)]`, total `8`, gaps `[(4, 5), (8, 10)]`

#### Hints

1. Sort by start time.
2. Keep the last merged window; extend it when the next one starts before (or exactly when) it ends.
3. Total time is the sum of merged lengths; gaps lie between consecutive merged windows.

#### Solution

Sort, then sweep once. Merging first is what makes the total correct: summing the raw windows would count overlaps
twice.

```python
def busy_time(windows: list[tuple[float, float]]) -> tuple[list[tuple[float, float]], float, list[tuple[float, float]]]:
    merged: list[tuple[float, float]] = []
    for start, end in sorted(windows):
        if start > end:
            raise ValueError(f"window ends before it starts: {(start, end)}")
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    total = sum(end - start for start, end in merged)
    gaps = [(a_end, b_start) for (_, a_end), (b_start, _) in zip(merged, merged[1:])]
    return merged, total, gaps


assert busy_time([(5, 8), (1, 3), (2, 4), (10, 12)]) == ([(1, 4), (5, 8), (10, 12)], 8, [(4, 5), (8, 10)])
assert busy_time([(1, 10), (2, 3)]) == ([(1, 10)], 9, [])         # contained window
assert busy_time([(1, 2), (2, 3)]) == ([(1, 3)], 2, [])           # touching windows merge
assert busy_time([]) == ([], 0, [])
try:
    busy_time([(3, 1)])
    raise AssertionError("should raise")
except ValueError:
    pass
```

Complexity: O(n log n) for the sort, O(n) for the sweep.

#### Follow-ups

- **Busy time per worker?** Group windows by worker first (`defaultdict(list)`), then run this per group.
- **Peak concurrency?** Turn each window into `(start, +1)` and `(end, -1)` events, sort, and track the running sum.

### Top k slowest tool calls {easy core}

Given tool-call records with a duration in milliseconds, return the k slowest, slowest first. Then handle an unbounded
stream using O(k) memory. Ties keep the earlier call.

#### Hints

1. Sorting everything is O(n log n). `heapq.nlargest(k, …, key=…)` is O(n log k).
2. For a stream, keep a min-heap of size k: its root is the fastest of the current top k, the one to evict.
3. Add a sequence number to heap entries so ties never compare the records themselves.

#### Solution

`heapq.nlargest` is the one-liner, and it matches a stable descending sort, so ties keep their input order. The
streaming version keeps `(duration, -sequence, record)` in a min-heap, so among equal durations the most recent call
is evicted first, and sorts the survivors at the end.

```python
import heapq
import random
from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class ToolCall:
    tool: str
    ms: int


def slowest(calls: list[ToolCall], k: int) -> list[ToolCall]:
    return heapq.nlargest(k, calls, key=lambda c: c.ms)


def slowest_stream(calls: Iterable[ToolCall], k: int) -> list[ToolCall]:
    if k <= 0:
        return []
    heap: list[tuple[int, int, ToolCall]] = []
    for seq, call in enumerate(calls):
        entry = (call.ms, -seq, call)
        if len(heap) < k:
            heapq.heappush(heap, entry)
        elif entry > heap[0]:
            heapq.heapreplace(heap, entry)
    return [call for _, _, call in sorted(heap, key=lambda e: (-e[0], -e[1]))]


calls = [ToolCall("search", 120), ToolCall("sap.create_po", 900), ToolCall("fetch", 300), ToolCall("embed", 900)]
assert slowest(calls, 2) == [ToolCall("sap.create_po", 900), ToolCall("embed", 900)]
assert slowest_stream(iter(calls), 2) == slowest(calls, 2)
assert slowest(calls, 10) == sorted(calls, key=lambda c: c.ms, reverse=True)
assert slowest_stream(calls, 0) == [] and slowest_stream([], 3) == []

rng = random.Random(7)
for _ in range(200):
    data = [ToolCall(f"t{i}", rng.randint(0, 20)) for i in range(rng.randint(0, 30))]
    k = rng.randint(0, 8)
    assert slowest_stream(data, k) == sorted(data, key=lambda c: c.ms, reverse=True)[:k]
```

Complexity: O(n log k) time, O(k) memory for the stream version.

#### Follow-ups

- **p99 latency over a stream?** Keep a histogram or a quantile sketch (t-digest), not every value.
- **Top k per tool?** A dict of heaps keyed by tool name.

### Aggregate service logs: errors per minute and p95 latency {medium}

Each log line looks like `2026-10-14T10:01:07Z planner ERROR 120ms Tool timeout`: timestamp, service, level, latency,
message. Return the number of `ERROR` lines per (service, minute), the p95 latency per service (nearest-rank method),
and how many lines were malformed.

#### Hints

1. `line.split(maxsplit=4)` gives the five parts, keeping spaces inside the message.
2. `datetime.fromisoformat` accepts the trailing `Z` since Python 3.11. Format the minute as the bucket key.
3. Nearest-rank p95: sort the values and take index `ceil(0.95 × n) - 1`. Catch parse errors per line and count them.

#### Solution

One pass with a `Counter` for errors and a `defaultdict(list)` for latencies, then one sort per service. Malformed
lines are counted, not fatal: a log processor should never die on one bad line.

```python
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime


@dataclass
class Summary:
    errors_per_minute: Counter[tuple[str, str]]
    p95_ms: dict[str, int]
    skipped: int


def p95(values: list[int]) -> int:
    ordered = sorted(values)
    return ordered[math.ceil(0.95 * len(ordered)) - 1]


def summarise(lines: list[str]) -> Summary:
    errors: Counter[tuple[str, str]] = Counter()
    latencies: defaultdict[str, list[int]] = defaultdict(list)
    skipped = 0
    for line in lines:
        try:
            stamp, service, level, latency, _message = line.split(maxsplit=4)
            minute = datetime.fromisoformat(stamp).strftime("%Y-%m-%dT%H:%M")
            if not latency.endswith("ms"):
                raise ValueError(latency)
            ms = int(latency.removesuffix("ms"))
        except ValueError:
            skipped += 1
            continue
        latencies[service].append(ms)
        if level == "ERROR":
            errors[(service, minute)] += 1
    return Summary(errors, {service: p95(values) for service, values in latencies.items()}, skipped)


LOG = [
    "2026-10-14T10:01:07Z planner ERROR 120ms Tool timeout: sap.create_po",
    "2026-10-14T10:01:42Z planner INFO 80ms Step finished",
    "2026-10-14T10:01:59Z planner ERROR 95ms Tool timeout: search",
    "2026-10-14T10:02:00Z planner ERROR 300ms Model returned invalid JSON",
    "2026-10-14T10:02:03Z gateway INFO 12ms GET /runs/42",
    "garbage line",
    "2026-10-14T10:02:04Z gateway WARN slow Upstream slow",
    "not-a-date gateway INFO 5ms x",
]
summary = summarise(LOG)
assert summary.errors_per_minute == Counter({("planner", "2026-10-14T10:01"): 2, ("planner", "2026-10-14T10:02"): 1})
assert summary.p95_ms == {"planner": 300, "gateway": 12}
assert summary.skipped == 3
assert p95(list(range(1, 101))) == 95 and p95([7]) == 7
assert summarise([]) == Summary(Counter(), {}, 0)
```

Complexity: O(n) to parse plus O(m log m) to sort each service's m latencies.

#### Follow-ups

- **A 10 GB file?** Read line by line (a file object is a lazy iterator) and keep a histogram per service instead of
  every latency.
- **Structured logs?** Prefer JSON lines (`json.loads` per line) over regex parsing, and include the trace id.

### Deduplicate contacts, keeping the latest record {medium}

Records from several systems describe the same person with differently formatted emails. Deduplicate by normalised
email (trim and case-fold), keep the most recently updated record, keep the output in first-seen order, and skip records
with a blank email.

#### Hints

1. Choose the key first: `email.strip().casefold()`.
2. A dict keyed by the normalised email holds the best record so far. Replacing a value keeps the key's original
   position, which gives first-seen order for free.
3. Compare real datetimes, not strings, so different but valid timestamp formats compare correctly.

#### Solution

One pass over the records. `casefold()` is stronger than `lower()` for non-English text (German ß becomes ss). Ties on
the timestamp keep the record seen first, which makes the output deterministic. Comparing a naive timestamp with an
aware one raises `TypeError`, so in real data normalise everything to UTC first.

```python
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Contact:
    email: str
    name: str
    updated_at: str  # ISO 8601


def dedupe_latest(records: list[Contact]) -> list[Contact]:
    best: dict[str, tuple[datetime, Contact]] = {}
    for record in records:
        key = record.email.strip().casefold()
        if not key:
            continue
        stamp = datetime.fromisoformat(record.updated_at)
        current = best.get(key)
        if current is None or stamp > current[0]:
            best[key] = (stamp, record)
    return [record for _, record in best.values()]


rows = [
    Contact("Ana@Example.com ", "Ana", "2026-10-01T09:00:00+00:00"),
    Contact("bo@example.com", "Bo", "2026-10-02T09:00:00+00:00"),
    Contact("ana@example.com", "Ana Lopez", "2026-10-05T09:00:00+00:00"),
    Contact("   ", "Nobody", "2026-10-06T09:00:00+00:00"),
    Contact("BO@EXAMPLE.COM", "Bo (old)", "2026-10-01T09:00:00+00:00"),
    Contact("strasse@example.de", "A", "2026-10-03T08:00:00+00:00"),
    Contact("STRASSE@example.de", "B", "2026-10-03T10:00:00+02:00"),  # same instant as 08:00 UTC
]
result = dedupe_latest(rows)
assert [c.name for c in result] == ["Ana Lopez", "Bo", "A"]  # first-seen order, latest data, tie keeps first
assert dedupe_latest([]) == []
assert "Straße".casefold() == "strasse" and "Straße".lower() == "straße"
```

Complexity: O(n) time, O(u) space for u unique emails.

#### Follow-ups

- **Fuzzy matches (typos, nicknames)?** Block by a cheap key (domain, first letter) and compare within blocks with a
  similarity score; send uncertain pairs to a human, which is the same HITL idea as document review.
- **Merge fields instead of picking one record?** Take each field from the newest record that has it set.

### Batch an iterator into fixed-size chunks {easy}

Write `batched(iterable, n)` that yields tuples of up to n items, lazily, so it works on generators and infinite
streams. This is how you send records to an API that accepts at most n per request.

#### Hints

1. Get an iterator once with `iter()`; do not index into the input.
2. `itertools.islice(it, n)` takes the next n items from the same iterator.
3. Stop when a slice comes back empty. Reject `n < 1`.

#### Solution

The walrus operator keeps the loop to two lines. Python 3.12 added `itertools.batched`, which behaves the same way; the
test compares them. Say you would use the built-in in real code.

```python
import itertools
from collections.abc import Iterable, Iterator


def batched[T](iterable: Iterable[T], n: int) -> Iterator[tuple[T, ...]]:
    if n < 1:
        raise ValueError("n must be at least one")
    it = iter(iterable)
    while batch := tuple(itertools.islice(it, n)):
        yield batch


assert list(batched("abcdefg", 3)) == [("a", "b", "c"), ("d", "e", "f"), ("g",)]
assert list(batched([], 2)) == []
for size in range(1, 6):
    assert list(batched(range(11), size)) == list(itertools.batched(range(11), size))

# Lazy: works on an infinite generator.
first_two = list(itertools.islice(batched(itertools.count(), 4), 2))
assert first_two == [(0, 1, 2, 3), (4, 5, 6, 7)]

try:
    list(batched([1], 0))
    raise AssertionError("should raise")
except ValueError:
    pass
```

Complexity: O(n) total time; O(batch size) memory.

#### Follow-ups

- **Batch by size in bytes, not count?** Accumulate items until adding the next would exceed the limit, then yield.
- **Async iterators?** The same idea with `async for` and an `async def` generator.

### In-memory pub/sub with topic wildcards {medium}

Build a small event bus. `subscribe(pattern, handler)` returns an unsubscribe function. Topics are dot-separated
(`runs.42.status`). In patterns, `*` matches exactly one segment and `#` matches zero or more. `publish` delivers to
every matching handler; one handler failing must not stop the others.

#### Hints

1. Split topics and patterns on `.` and match segment by segment.
2. `#` is the only tricky case: try letting it swallow 0, 1, 2… segments.
3. Iterate over a copy of the subscriptions, so a handler can unsubscribe while you publish.

#### Solution

A recursive matcher over positions, memoised per call (several `#` segments would otherwise be exponential). The memo
lives inside the call on purpose: a module-level `@cache` keyed by topic would grow forever in a service whose topics
contain run ids. Subscriptions are stored by id, so unsubscribing is O(1) and safe to call twice. Errors are collected
and returned instead of raised.

```python
from collections.abc import Callable
from functools import cache

Handler = Callable[[str, object], None]


def matches(pattern: tuple[str, ...], topic: tuple[str, ...]) -> bool:
    @cache
    def match(p: int, t: int) -> bool:
        if p == len(pattern):
            return t == len(topic)
        if pattern[p] == "#":
            return any(match(p + 1, i) for i in range(t, len(topic) + 1))
        return t < len(topic) and pattern[p] in ("*", topic[t]) and match(p + 1, t + 1)

    return match(0, 0)


class PubSub:
    def __init__(self) -> None:
        self._subs: dict[int, tuple[tuple[str, ...], Handler]] = {}
        self._next_id = 0

    def subscribe(self, pattern: str, handler: Handler) -> Callable[[], None]:
        sub_id = self._next_id
        self._next_id += 1
        self._subs[sub_id] = (tuple(pattern.split(".")), handler)

        def unsubscribe() -> None:
            self._subs.pop(sub_id, None)

        return unsubscribe

    def publish(self, topic: str, message: object) -> tuple[int, list[Exception]]:
        parts = tuple(topic.split("."))
        delivered, errors = 0, []
        for pattern, handler in list(self._subs.values()):
            if matches(pattern, parts):
                try:
                    handler(topic, message)
                    delivered += 1
                except Exception as exc:
                    errors.append(exc)
        return delivered, errors


assert matches(("runs", "*", "status"), ("runs", "42", "status"))
assert not matches(("runs", "*", "status"), ("runs", "42", "steps", "status"))
assert all(matches(("runs", "#"), tuple(t.split("."))) for t in ["runs", "runs.1", "runs.1.steps.2"])
assert matches(("#", "status"), ("runs", "1", "status")) and matches(("#",), ())
assert matches(("#", "#", "x", "#"), ("a",) * 30 + ("x",)) and not matches(("#", "#", "x", "#"), ("a",) * 30)

bus = PubSub()
seen: list[tuple[str, object]] = []
stop_status = bus.subscribe("runs.*.status", lambda t, m: seen.append((t, m)))
bus.subscribe("runs.#", lambda t, m: None)


def broken(topic: str, message: object) -> None:
    raise RuntimeError("handler bug")


bus.subscribe("runs.42.#", broken)

delivered, errors = bus.publish("runs.42.status", "running")
assert delivered == 2 and [str(e) for e in errors] == ["handler bug"]
assert seen == [("runs.42.status", "running")]

stop_status()
stop_status()  # safe to call twice
assert bus.publish("runs.7.status", "done") == (1, [])
assert seen == [("runs.42.status", "running")]
```

Complexity: matching visits at most P × T memoised states for a pattern of P segments and a topic of T (a `#` state
tries up to T splits); publish is O(subscriptions × match cost).

#### Follow-ups

- **Thousands of patterns?** Index subscriptions in a trie of segments, with `*` and `#` children, instead of testing
  every pattern.
- **Across processes?** Use Redis pub/sub or Pub/Sub topics; in-memory only works within one instance.

### Flatten nested JSON into dotted keys {medium}

Turn nested dicts and lists into a flat dict with dotted paths, for example to index a tool-call payload or write it
to a table. List items use their index. Empty dicts and lists are kept as values.

`{"run": {"id": 7, "steps": [{"tool": "search"}, {"tool": "sap"}]}, "tags": []}` →
`{"run.id": 7, "run.steps.0.tool": "search", "run.steps.1.tool": "sap", "tags": []}`

#### Hints

1. Recurse with the path so far.
2. Non-empty dicts and lists recurse; everything else (including empty containers) is a leaf.
3. Join path parts with the separator, and avoid a leading dot for top-level keys.

#### Solution

A small recursive walk. Use an iterative stack instead if documents can be deeply nested; JSON from a model is usually
shallow, so recursion is fine here, and you say so.

```python
from typing import Any


def flatten(value: Any, sep: str = ".") -> dict[str, Any]:
    flat: dict[str, Any] = {}

    def walk(node: Any, path: str) -> None:
        if isinstance(node, dict) and node:
            items = ((str(k), v) for k, v in node.items())
        elif isinstance(node, list) and node:
            items = ((str(i), v) for i, v in enumerate(node))
        else:
            flat[path] = node
            return
        for key, child in items:
            walk(child, f"{path}{sep}{key}" if path else key)

    walk(value, "")
    return flat


doc = {"run": {"id": 7, "steps": [{"tool": "search"}, {"tool": "sap"}]}, "tags": [], "meta": {}}
assert flatten(doc) == {
    "run.id": 7,
    "run.steps.0.tool": "search",
    "run.steps.1.tool": "sap",
    "tags": [],
    "meta": {},
}
assert flatten({"a": {"b": None}}) == {"a.b": None}
assert flatten([1, [2, 3]]) == {"0": 1, "1.0": 2, "1.1": 3}
assert flatten(5) == {"": 5}
assert flatten({"a": {"b": 1}}, sep="/") == {"a/b": 1}
```

Complexity: O(total number of values) time and space.

#### Follow-ups

- **Keys that contain the separator?** Escape them (for example JSON Pointer's `~1` for `/`), or return tuples of path
  parts instead of strings.
- **Unflatten?** Split each key, walk or create dicts along the path, and turn dicts whose keys are 0…n−1 back into lists.

### First successful response from hedged calls {hard}

To cut tail latency, the platform sends the same request to several providers (or replicas) at once and uses the first
successful answer. Write `first_success(factories, timeout)`: return the first result that does not raise, cancel the
others, raise an `ExceptionGroup` if all fail, and raise `TimeoutError` if nothing succeeds in time.

#### Hints

1. Start every call as a task, then loop on `asyncio.wait(pending, return_when=FIRST_COMPLETED)`.
2. A finished task either has a result (return it) or an exception (record it and keep waiting).
3. Cancel and await the leftover tasks in a `finally` block, so nothing keeps running after you return or time out.

#### Solution

`asyncio.timeout` bounds the whole wait. The `finally` block runs on success, on failure and on timeout, cancels every
task that is still running, and awaits them so their cancellation is complete before the function returns.

```python
import asyncio
from collections.abc import Awaitable, Callable


async def first_success[T](factories: list[Callable[[], Awaitable[T]]], timeout: float) -> T:
    if not factories:
        raise ValueError("need at least one call")
    tasks = [asyncio.ensure_future(f()) for f in factories]
    errors: list[Exception] = []
    try:
        async with asyncio.timeout(timeout):
            pending = set(tasks)
            while pending:
                done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    error = task.exception()
                    if error is None:
                        return task.result()
                    errors.append(error)  # type: ignore[arg-type]
        raise ExceptionGroup("every call failed", errors)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


cancelled: list[str] = []


def provider(name: str, delay: float, fail: bool = False) -> Callable[[], Awaitable[str]]:
    async def call() -> str:
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            cancelled.append(name)
            raise
        if fail:
            raise ConnectionError(f"{name} unavailable")
        return name

    return call


# The fast provider fails, the medium one wins, the slow one is cancelled.
winner = asyncio.run(first_success([provider("slow", 0.5), provider("fast", 0.01, fail=True), provider("medium", 0.03)], timeout=1))
assert winner == "medium" and cancelled == ["slow"]

try:
    asyncio.run(first_success([provider("a", 0.01, fail=True), provider("b", 0.02, fail=True)], timeout=1))
    raise AssertionError("should raise")
except* ConnectionError as group:
    assert sorted(str(e) for e in group.exceptions) == ["a unavailable", "b unavailable"]

cancelled.clear()
try:
    asyncio.run(first_success([provider("x", 1.0), provider("y", 1.0)], timeout=0.05))
    raise AssertionError("should raise")
except TimeoutError:
    assert sorted(cancelled) == ["x", "y"]  # nothing left running
```

Complexity: O(k) tasks; the wait ends at the first success, the last failure, or the timeout.

#### Follow-ups

- **Hedge only after a delay?** Start the first call, wait for it with a short timeout (say the p95 latency), and only
  then start the backup. This keeps extra load low.
- **Is hedging safe for every call?** Only for idempotent, read-like operations. Never hedge "create a purchase order"
  without an idempotency key.
