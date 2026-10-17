---
title: GIL, threads, processes and asyncio
goal: Pick the right concurrency model for a task (threads, processes or asyncio), explain the GIL accurately, and write bounded, cancellable async code live.
minutes: 50
---

Concurrency is where Python interviews separate people who have read about the GIL from people who have shipped services. Expect questions like "What is the GIL?", "Threads or asyncio for calling 500 APIs?", "Why did my FastAPI endpoint freeze?" and "How would you speed up this CPU-heavy job?"

Two decisions organise the whole chapter:

1. **Is the work I/O-bound or CPU-bound?** I/O-bound means waiting on a network, disk or database. CPU-bound means computing: parsing, model inference, number crunching.
2. **How many tasks, and do they need shared state?**

Everything else is detail: locks, `TaskGroup`, semaphores and the free-threaded build.

## The GIL in one paragraph

CPython's **Global Interpreter Lock** lets only **one thread execute Python bytecode at a time** in a process. It exists because CPython's memory management (reference counting) isn't thread-safe without it, and one big lock made the interpreter and C extensions simple and fast single-threaded.

The consequences:

- Threads **do** run concurrently for I/O, because the GIL is **released** while a thread waits on a socket, a file or `time.sleep`. Many C extensions, such as NumPy and hashlib, also release it during heavy work.
- Threads **don't** speed up pure-Python CPU work. They take turns holding the GIL; the interpreter asks the running thread to drop it every 5 ms (`sys.getswitchinterval()`).

For CPU parallelism, use **processes**, which each have their own interpreter and GIL. Python 3.13 added an experimental **free-threaded build** without the GIL, and 3.14 made it officially supported, though it is still a separate build and not the default.

## Choose the tool

| Workload | Best tool | Why |
|---|---|---|
| Many network/DB calls, async libraries available | **asyncio** | Thousands of concurrent waits on one thread; cheap tasks; explicit `await` points |
| I/O with blocking libraries (requests, many DB drivers, boto3) | **threads** (`ThreadPoolExecutor`) | The GIL is released while blocked; no need to rewrite code as async |
| CPU-bound pure Python (parsing, feature computation) | **processes** (`ProcessPoolExecutor`) | Separate GILs, so real parallelism on many cores |
| CPU-bound numeric work | **vectorised NumPy/pandas** first, then processes | C code releases the GIL and avoids the Python loop entirely |
| Long-running or must survive restarts | **task queue** (Celery, RQ, Cloud Tasks, Pub/Sub) | Durable, retryable, scales on separate workers |

## Threads and locks

```python
import threading
import time
from concurrent.futures import ThreadPoolExecutor


def fetch(record_id: int) -> str:
    time.sleep(0.1)  # stands in for a blocking HTTP or DB call: the GIL is released while waiting
    return f"record-{record_id}"


start = time.perf_counter()
with ThreadPoolExecutor(max_workers=10) as pool:
    results = list(pool.map(fetch, range(10)))  # map keeps input order
elapsed = time.perf_counter() - start
assert results[0] == "record-0" and len(results) == 10
assert elapsed < 0.5, elapsed  # about 0.1 s, not 1.0 s: the waits overlap


class Counter:
    def __init__(self) -> None:
        self.value = 0
        self._lock = threading.Lock()

    def increment(self) -> None:
        with self._lock:  # read-modify-write must be atomic
            self.value += 1


c = Counter()
with ThreadPoolExecutor(max_workers=8) as pool:
    for _ in range(10_000):
        pool.submit(c.increment)
assert c.value == 10_000
```

`counter += 1` is a read, an add and a write: several bytecodes. A thread can be switched out between them, so updates can be lost. **The GIL does not make your code thread-safe.** It only protects the interpreter's internals. Use a `Lock` around shared mutable state, or avoid sharing altogether: give each worker its own data, then combine the results, or communicate through `queue.Queue`.

## Processes for CPU-bound work

```python
from concurrent.futures import ProcessPoolExecutor


def count_primes(bounds: tuple[int, int]) -> int:
    lo, hi = bounds
    count = 0
    for n in range(max(lo, 2), hi):
        if all(n % d for d in range(2, int(n**0.5) + 1)):
            count += 1
    return count


if __name__ == "__main__":  # required: child processes re-import this module (spawn / forkserver)
    chunks = [(i, i + 25_000) for i in range(0, 100_000, 25_000)]
    with ProcessPoolExecutor(max_workers=4) as pool:
        total = sum(pool.map(count_primes, chunks))
    assert total == 9592  # primes below 100,000
```

Processes cost more than threads. Each one starts an interpreter, and arguments and results are **pickled** across process boundaries, so send small inputs and get back small results. The start method matters: macOS and Windows use `spawn`. Linux defaulted to `fork` until 3.14, which switched the default to `forkserver`. With `spawn` or `forkserver`, the worker function must be importable (defined at module level) and the entry point must be guarded by `if __name__ == "__main__":`.

## asyncio essentials

```python
import asyncio
import time


async def call_api(name: str, delay: float) -> str:
    await asyncio.sleep(delay)  # yields control to the event loop while "waiting on the network"
    return name


async def main() -> None:
    # gather: run concurrently, results in argument order
    start = time.perf_counter()
    results = await asyncio.gather(call_api("eligibility", 0.1), call_api("claims", 0.1), call_api("auth", 0.1))
    assert results == ["eligibility", "claims", "auth"]
    assert time.perf_counter() - start < 0.3

    # TaskGroup (3.11+): structured concurrency; one failure cancels the siblings
    async with asyncio.TaskGroup() as tg:
        t1 = tg.create_task(call_api("a", 0.05))
        t2 = tg.create_task(call_api("b", 0.05))
    assert (t1.result(), t2.result()) == ("a", "b")

    # Timeouts (3.11+)
    try:
        async with asyncio.timeout(0.05):
            await call_api("slow payer", 1)
        raise AssertionError
    except TimeoutError:
        pass

    # A blocking function must not run on the event loop: push it to a thread
    def blocking_io() -> str:
        time.sleep(0.05)
        return "done"

    assert await asyncio.to_thread(blocking_io) == "done"


asyncio.run(main())
```

Key vocabulary:

- A **coroutine** is created by calling an `async def` function. Nothing runs until it is awaited or scheduled.
- A **task** wraps a coroutine and schedules it on the event loop (`asyncio.create_task`). Keep a reference to it, or it may be garbage-collected mid-run.
- The **event loop** runs one task until it hits an `await` on something not ready, then switches to another task. It is **single-threaded**, so code between `await`s never interleaves with other tasks.

## Blocking the event loop: the classic production bug

```python
import asyncio
import time


async def bad_handler() -> None:
    time.sleep(0.2)  # blocks the whole loop: no other task can run


async def good_handler() -> None:
    await asyncio.sleep(0.2)  # or: await asyncio.to_thread(blocking_call)


async def measure(handler) -> float:
    start = time.perf_counter()
    await asyncio.gather(*(handler() for _ in range(5)))
    return time.perf_counter() - start


bad = asyncio.run(measure(bad_handler))
good = asyncio.run(measure(good_handler))
assert bad >= 1.0      # 5 × 0.2 s, run one after another
assert good < 0.5      # about 0.2 s, overlapped
```

Inside `async def`, never call `time.sleep`, `requests.get`, a synchronous DB driver or heavy CPU code. Use async libraries (`httpx.AsyncClient`, `asyncpg`, SQLAlchemy's async engine), or offload the call with `asyncio.to_thread` for blocking I/O, or `loop.run_in_executor(process_pool, ...)` for CPU work.

## How FastAPI runs your endpoints

- An **`async def` endpoint** runs directly on the event loop. It is fast when it only awaits async I/O, and it **freezes the whole worker** if it blocks.
- A **plain `def` endpoint** runs in a **thread pool** (Starlette uses AnyIO, which allows 40 worker threads by default). Blocking calls are fine there.
- Rule of thumb: use `async def` when you use async clients throughout, and `def` when you call blocking libraries. Never use `async def` plus blocking calls.
- For parallelism across cores, run several **worker processes** (`uvicorn --workers 4`, Gunicorn with Uvicorn workers, or more replicas on Cloud Run or Kubernetes).
- Use **BackgroundTasks** for small fire-and-forget work after the response. Use a real queue for anything heavy, slow or important.

**Your angle:** on the Document AI platform, FastAPI services ran on Cloud Run. Scaling came from container instances and concurrency settings, and long-running extraction work was triggered by events (storage triggers, Cloud Functions) rather than done inside a request.

## Interview questions

### What is the GIL? {core}

The Global Interpreter Lock is a mutex in **CPython** that allows only one thread to execute Python bytecode at a time per process. It exists because CPython uses reference counting for memory management, and a single lock made that and C extensions simple and fast.

The practical effect: threads give you **concurrency for I/O**, because the GIL is released while waiting on network or disk, but **not parallelism for pure-Python CPU work**. For CPU parallelism, use multiple processes, or code that drops the GIL (NumPy and other C extensions). Since 3.13 there is an optional free-threaded build without a GIL, officially supported since 3.14 but not the default.

### If the GIL exists, why are threads still useful? {core}

Most backend work is **I/O-bound**: waiting for HTTP calls, databases and file reads. A thread that waits on I/O **releases the GIL**, so other threads run in the meantime. Ten threads that each wait 100 ms on an API finish in about 100 ms total, not 1 s. Threads also let you use blocking libraries (`requests`, `boto3`, many DB drivers) concurrently without rewriting them as async. FastAPI's thread pool for `def` endpoints relies on exactly this.

### Threading vs multiprocessing vs asyncio: when do you use each? {core}

- **asyncio**: I/O-bound work with high concurrency (hundreds or thousands of connections) when async libraries exist. One thread, very cheap tasks, explicit `await` points.
- **Threads**: I/O-bound work using blocking libraries, or moderate concurrency where rewriting to async isn't worth it.
- **Processes**: CPU-bound pure-Python work that needs multiple cores. They cost more: startup, pickling, memory.

And the senior addition: for numeric work, **vectorise** first (NumPy or pandas), and for long or important jobs, use a **task queue** instead of in-process concurrency. You can combine them too: an asyncio service that offloads CPU work to a `ProcessPoolExecutor`.

### Concurrency vs parallelism? {core}

**Concurrency** is about *structure*: dealing with many things at once by interleaving them, like one cook handling several dishes. **Parallelism** is about *execution*: doing many things at the same instant on multiple cores, like several cooks. asyncio and threads under the GIL give concurrency. Multiple processes, and the free-threaded build, give parallelism.

### What is a race condition? Does the GIL prevent it? {core}

A race condition is when the result depends on the timing of threads touching shared state, for example two threads doing `balance -= amount` after both checked `balance >= amount`. **The GIL doesn't prevent it.** It only protects the interpreter's own state: a thread can be switched out between any two bytecodes, and `x += 1` or check-then-act logic spans several of them.

Fixes: protect the critical section with a `threading.Lock`, avoid shared mutable state (each worker returns results, and you combine them), use thread-safe structures like `queue.Queue`, or push the atomicity into the database (`UPDATE … SET balance = balance - :x WHERE balance >= :x`).

### What synchronisation primitives does Python offer? {deep}

From the `threading` module:

- **Lock**: mutual exclusion; always use it with `with`.
- **RLock**: re-entrant, so the same thread can acquire it again (for recursive code paths).
- **Semaphore** or **BoundedSemaphore**: allows N holders at once, for limiting concurrent connections.
- **Event**: one thread signals, others wait.
- **Condition**: wait until some state changes, as in producer/consumer.
- **Barrier**: N threads wait until all of them arrive.

asyncio has async equivalents (`asyncio.Lock`, `Semaphore`, `Event`, `Queue`). They are not thread-safe and only work within one event loop.

### What is a deadlock? How do you avoid one? {core}

A deadlock is when two or more threads each hold a lock the other needs, so all of them wait forever. Thread A holds `L1` and wants `L2`; thread B holds `L2` and wants `L1`.

Avoid it by:

- Always acquiring locks in **one global order**.
- Holding locks for the shortest time, and never calling unknown code while holding one.
- Using timeouts (`lock.acquire(timeout=...)`).
- Preferring designs without shared locks: message passing with queues, or immutable data.

Databases have the same problem with row locks, so update rows in a consistent order.

### How do `ThreadPoolExecutor` and `ProcessPoolExecutor` work? {core}

Both implement the `concurrent.futures.Executor` interface, so you can swap one for the other:

- `submit(fn, *args)` returns a **Future**. `future.result()` blocks until the call finishes and **re-raises** any exception from the worker.
- `map(fn, iterable)` returns results **in input order**.
- `as_completed(futures)` yields futures **as they finish**, which is good for progress reporting or acting on the fastest results.
- Use them as context managers, so they shut down and wait for running work.

The thread pool's default is `min(32, cpu_count + 4)` workers. The process pool defaults to the number of CPUs the process can use. For processes, functions and arguments must be picklable.

### What does multiprocessing cost? `fork` vs `spawn`? {deep}

Every worker is a full interpreter. That means startup time, more memory, and **pickling** of every argument and result across the process boundary, so passing a large DataFrame back and forth can cost more than the computation saves.

With **`fork`**, the child is a copy of the parent's memory, so startup is fast, but forking a process that has threads or open locks is unsafe. **`spawn`** starts a fresh interpreter that re-imports your module: it is slower but safe, and it is the default on macOS and Windows. **`forkserver`** forks children from a clean server process, and it is the Linux default from Python 3.14. With `spawn` or `forkserver`, put the entry point under `if __name__ == "__main__":`.

### Explain async/await and the event loop. {core}

`async def` defines a coroutine function. Calling it returns a coroutine object, and nothing runs yet. `await` suspends the current coroutine until the awaited operation (a network read, a sleep, another coroutine) is ready, and hands control back to the **event loop**. The loop keeps a set of tasks and runs whichever is ready, until that task hits its next `await`.

All of this happens on **one thread**, so it is cooperative multitasking. Thousands of concurrent connections cost little memory, and there are no data races between `await` points. The flip side: any blocking call or long computation stalls every task on that loop.

### `gather` vs `create_task` vs `TaskGroup`? {core}

- `asyncio.create_task(coro)` schedules one coroutine to run in the background and returns a Task you can await later. Keep a reference to it.
- `asyncio.gather(*aws)` runs several concurrently and returns the results in order. If one fails, the exception propagates to whoever awaits `gather`, but **the other tasks keep running**. Pass `return_exceptions=True` to get exceptions back as values.
- `asyncio.TaskGroup` (3.11+) gives **structured concurrency**. Tasks created in the `async with` block are all awaited when it exits. If one fails, the rest are **cancelled**, and you get an `ExceptionGroup`.

Prefer `TaskGroup` for new code: no orphaned tasks, and errors aren't lost.

### What happens if you call blocking code inside `async def`? {core}

It **blocks the entire event loop**. Every other request or task on that loop freezes until the call returns. In FastAPI, one `time.sleep(2)` or `requests.get(...)` in an `async def` endpoint makes every concurrent request on that worker wait. Health checks can then time out, and the instance gets restarted.

Fixes: use async libraries (`httpx.AsyncClient`, `asyncpg`, async SQLAlchemy), or wrap the blocking call with `await asyncio.to_thread(fn, ...)`, or declare the endpoint with plain `def` so FastAPI runs it in its thread pool. Send CPU-heavy work to a process pool or a job queue.

### How do you limit concurrency, for example to 10 calls at a time? {core}

Use an `asyncio.Semaphore(10)` and `async with sem:` around each call. You can still create all the tasks up front, but only 10 hold the semaphore at once. With threads, the pool size limits it (`ThreadPoolExecutor(max_workers=10)`). This protects downstream services and respects rate limits. The first coding problem below implements it.

### How do timeouts and cancellation work in asyncio? {deep}

`async with asyncio.timeout(seconds):` (3.11+) or `await asyncio.wait_for(coro, seconds)` cancels the inner work and raises `TimeoutError` when time runs out. Cancellation is delivered as an `asyncio.CancelledError` **raised at the task's current `await`**. Clean up with `try/finally` and **re-raise** `CancelledError`; swallowing it breaks timeouts and shutdown.

`task.cancel()` requests cancellation explicitly. `TaskGroup` cancels the siblings when one task fails. In 3.8 and later, `CancelledError` inherits from `BaseException`, so `except Exception` doesn't swallow it by accident.

### How does FastAPI handle `def` vs `async def` endpoints? {core}

FastAPI, through Starlette, runs **`async def` endpoints on the event loop** and **`def` endpoints in a thread pool** (AnyIO's default limit is 40 threads). So `def` is safe for blocking libraries, and `async def` is best when everything inside is awaited.

The mistake to avoid is `async def` plus blocking calls, which serialises the worker. Dependencies follow the same rule. For CPU-bound work, neither helps much: offload it to a process pool or a queue, and scale out with multiple Uvicorn workers or replicas.

### What is free-threaded Python? {deep}

PEP 703 added an optional CPython build without the GIL (`python3.13t`, `python3.14t`), experimental in 3.13 and **officially supported in 3.14** (PEP 779). It is still not the default build. In it, threads can run Python bytecode truly in parallel on multiple cores. The trade-offs: some single-threaded overhead, C extensions must be built for it and declare that they support it (or the GIL is re-enabled), and code that accidentally relied on the GIL to hide races can now break. It is worth knowing about, but processes are still the standard answer for CPU parallelism today.

### How would you speed up a CPU-heavy Python job? {core}

Go in order:

1. **Profile** first (`cProfile`, `py-spy`) to find the actual hotspot.
2. **Improve the algorithm or data structure**, for example O(n²) to O(n log n), or a set lookup instead of a list scan.
3. **Vectorise** with NumPy or pandas, so the loop runs in C.
4. **Parallelise** across cores with `ProcessPoolExecutor` or `multiprocessing`, splitting the work into chunks that are big enough to amortise pickling.
5. Consider **compiled code**: Numba, Cython, or a Rust or C extension.
6. For huge data, use **distributed** tools: Spark or Dask, or batch jobs on the cloud.

Mention measuring after each step.

### How do you build a producer/consumer pipeline? {deep}

Use a queue between them. With threads, `queue.Queue` is thread-safe: producers `put()`, a pool of consumer threads `get()`, and a sentinel value (or `task_done()` plus `join()`) signals completion. With asyncio, `asyncio.Queue` works the same way across coroutines. Bounded queues (`maxsize`) apply **back-pressure**: fast producers wait instead of filling memory. At system scale, the same pattern is Pub/Sub, SQS, Service Bus or Kafka between services.

### Are Python lists and dicts thread-safe? {deep}

In CPython with the GIL, single operations like `list.append` or `dict[key] = value` happen to be atomic, but that is an implementation detail and not a language guarantee, and compound operations (`if key not in d: d[key] = ...`, `x += 1`) are not atomic at all. In the free-threaded build, CPython adds internal per-object locks so that built-ins don't corrupt, but your compound logic still races. Use locks for compound updates and `queue.Queue` for hand-offs, and don't rely on the GIL for correctness.

### What is the difference between FastAPI `BackgroundTasks` and Celery or a cloud queue? {deep}

`BackgroundTasks` run **in the same process, after the response is sent**. That is fine for small, non-critical work like sending a notification email. But they are lost if the process restarts, aren't retried, and compete with request handling for CPU.

A **task queue** (Celery or RQ with Redis or RabbitMQ, Cloud Tasks, Pub/Sub, SQS or Service Bus with workers) is durable, retryable, observable and scales independently. Use it for document processing, report generation, model inference batches and anything that must not be lost.

### How do you call async code from sync code, and the other way round? {deep}

From sync to async: `asyncio.run(main())` at the entry point. It creates a loop, runs the coroutine and closes the loop. Don't call it inside a running loop. From async to blocking sync: `await asyncio.to_thread(fn, *args)`. From another thread into a running loop: `asyncio.run_coroutine_threadsafe(coro, loop)`, which returns a `concurrent.futures.Future`. FastAPI hides most of this: it runs `def` dependencies and endpoints in its thread pool for you.

## Coding problems

### Fetch many records with bounded concurrency {medium core}

You must call an async `fetch(id)` for 20 IDs, but the downstream payer API allows **at most 5 concurrent requests**. Write `fetch_all(ids, limit)` that returns the results **in the same order as `ids`**, runs as concurrently as the limit allows, and never exceeds `limit` in-flight calls. If one call fails, record the exception in its slot instead of losing the other results.

#### Hints

1. `asyncio.Semaphore(limit)`. Wrap each call in `async with sem:`.
2. `asyncio.gather(*tasks, return_exceptions=True)` keeps the input order and returns exceptions as values.
3. To prove the limit holds, track an `in_flight` counter and its maximum inside the fake fetch.

#### Solution

The semaphore caps the concurrency, and `gather` preserves the order. `return_exceptions=True` means one failure doesn't throw away 19 good results. Without the semaphore, all 20 calls would start at once.

```python
import asyncio
import time

state = {"in_flight": 0, "max_seen": 0}


async def fetch(record_id: int) -> dict[str, int]:
    state["in_flight"] += 1
    state["max_seen"] = max(state["max_seen"], state["in_flight"])
    try:
        await asyncio.sleep(0.05)  # simulated network latency
        if record_id == 13:
            raise ConnectionError("payer api reset")
        return {"id": record_id}
    finally:
        state["in_flight"] -= 1


async def fetch_all(ids: list[int], limit: int) -> list[dict[str, int] | BaseException]:
    sem = asyncio.Semaphore(limit)

    async def guarded(record_id: int) -> dict[str, int]:
        async with sem:
            return await fetch(record_id)

    return await asyncio.gather(*(guarded(i) for i in ids), return_exceptions=True)


start = time.perf_counter()
results = asyncio.run(fetch_all(list(range(20)), limit=5))
elapsed = time.perf_counter() - start

assert state["max_seen"] == 5                       # never more than the limit
assert elapsed < 0.6, elapsed                      # about 4 waves × 0.05 s, not 20 × 0.05 s
assert results[0] == {"id": 0} and results[19] == {"id": 19}
assert isinstance(results[13], ConnectionError)    # failure kept in its slot
assert sum(isinstance(r, dict) for r in results) == 19
```

Complexity: about `ceil(n / limit)` rounds of latency. Memory is O(n) for the results.

#### Follow-ups

- **Retry failures?** Wrap `fetch` in a retry loop with backoff, retrying only transient errors.
- **10 million IDs?** Don't create 10 million tasks. Use a fixed pool of worker coroutines reading from an `asyncio.Queue`, and stream the results out.
- **Rate limit per second, not concurrency?** Use a token bucket (see the practical coding chapter).

### Thread-safe counter and transfer {medium core}

Many threads move money between two accounts at the same time. Implement `transfer(src, dst, amount)` so that money is never created or lost, no balance ever goes negative, and two opposite transfers running at once can't deadlock.

#### Hints

1. Each account gets its own `threading.Lock`.
2. A transfer needs **both** locks. Taking them in different orders in two threads is the classic deadlock.
3. Always lock in a fixed global order, for example by account ID.

#### Solution

Lock ordering prevents the deadlock: `A→B` and `B→A` transfers both lock the lower ID first. The check and the update happen under both locks, so the balance can't change between them. The invariant to assert: the total money stays constant.

```python
import random
import threading
from concurrent.futures import ThreadPoolExecutor


class Account:
    def __init__(self, account_id: int, balance: int) -> None:
        self.id = account_id
        self.balance = balance
        self.lock = threading.Lock()


def transfer(src: Account, dst: Account, amount: int) -> bool:
    first, second = (src, dst) if src.id < dst.id else (dst, src)  # global lock order
    with first.lock, second.lock:
        if src.balance < amount:
            return False
        src.balance -= amount
        dst.balance += amount
        return True


a, b = Account(1, 1_000), Account(2, 1_000)
rng = random.Random(7)
jobs = [(a, b, rng.randint(1, 50)) if rng.random() < 0.5 else (b, a, rng.randint(1, 50)) for _ in range(5_000)]

with ThreadPoolExecutor(max_workers=16) as pool:
    outcomes = list(pool.map(lambda job: transfer(*job), jobs))

assert a.balance + b.balance == 2_000           # money conserved
assert a.balance >= 0 and b.balance >= 0        # never negative
assert any(outcomes)                            # finished: no deadlock
```

Complexity: each transfer is O(1), and they are serialised per account pair.

#### Follow-ups

- **In a real system?** Let the database do it: one transaction that locks both rows in ID order (`SELECT … FOR UPDATE ORDER BY id`), or a conditional `UPDATE … WHERE balance >= :amount` that checks the row count.
- **Why not one global lock?** It works, but it serialises every transfer in the system. Per-account locks let unrelated transfers run in parallel.

### Async producer/consumer pipeline {medium}

Documents arrive from a producer. Write `process_all(doc_ids, workers)`, where one producer puts IDs on an `asyncio.Queue(maxsize=5)` and `workers` consumer coroutines each "process" a document (simulate it with `await asyncio.sleep`). Return a dict mapping each ID to its result. All workers must stop cleanly when the work is done.

#### Hints

1. Consumers loop on `await queue.get()`, then call `queue.task_done()` in a `finally`.
2. Once the producer has put everything, `await queue.join()` waits until every item is done. Then cancel the workers, or send one sentinel (`None`) per worker.
3. `maxsize` makes the producer wait when consumers fall behind. That is back-pressure.

#### Solution

The bounded queue keeps memory steady, `join()` waits for completion, and a sentinel per worker gives each consumer a clean exit. Results go into a shared dict. That is safe because asyncio runs on one thread, and a dict assignment between awaits can't interleave.

```python
import asyncio
import time


async def process(doc_id: str) -> str:
    await asyncio.sleep(0.02)  # OCR / extraction / validation stand-in
    return doc_id.upper()


async def process_all(doc_ids: list[str], workers: int) -> dict[str, str]:
    queue: asyncio.Queue[str | None] = asyncio.Queue(maxsize=5)
    results: dict[str, str] = {}

    async def consumer() -> None:
        while True:
            doc_id = await queue.get()
            try:
                if doc_id is None:  # sentinel: stop
                    return
                results[doc_id] = await process(doc_id)
            finally:
                queue.task_done()

    async with asyncio.TaskGroup() as tg:
        for _ in range(workers):
            tg.create_task(consumer())
        for doc_id in doc_ids:
            await queue.put(doc_id)  # waits when the queue is full (back-pressure)
        for _ in range(workers):
            await queue.put(None)
    return results


ids = [f"doc{i}" for i in range(40)]
start = time.perf_counter()
out = asyncio.run(process_all(ids, workers=8))
elapsed = time.perf_counter() - start
assert out == {i: i.upper() for i in ids}
assert elapsed < 0.5, elapsed  # 40 × 0.02 s / 8 workers ≈ 0.1 s
assert asyncio.run(process_all([], workers=3)) == {}
```

Complexity: about `n / workers × per-item time`. Memory is bounded by the queue size plus the results.

#### Follow-ups

- **One document fails?** Catch the exception per item inside `consumer` and record it (or send it to a dead-letter list). Otherwise the `TaskGroup` cancels everything.
- **Across machines?** Swap `asyncio.Queue` for Pub/Sub or SQS, run the consumers as separate workers or Cloud Run jobs, and make the processing idempotent.

### Parallelise CPU-bound work across processes {medium}

`score(record)` is a pure-Python, CPU-heavy function. Write `score_all(records, workers)` that scores 40 records in parallel across processes and returns the scores in input order. Explain why threads wouldn't help here.

#### Hints

1. `ProcessPoolExecutor(max_workers=workers)` and `pool.map(score, records, chunksize=...)`.
2. `chunksize` batches items per inter-process message, which cuts pickling overhead for many small tasks.
3. The function must be defined at module level, and the entry point needs `if __name__ == "__main__":`.

#### Solution

Pure-Python computation holds the GIL, so threads would just take turns. Processes each have their own GIL and run on separate cores. `map` keeps the input order, and `chunksize` sends batches instead of one item per message.

```python
import time
from concurrent.futures import ProcessPoolExecutor


def score(record: int) -> int:
    total = 0
    for i in range(150_000):  # deliberately CPU-heavy pure Python
        total = (total + i * record) % 1_000_003
    return total


def score_all(records: list[int], workers: int) -> list[int]:
    with ProcessPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(score, records, chunksize=4))


if __name__ == "__main__":
    records = list(range(40))
    t0 = time.perf_counter()
    serial = [score(r) for r in records]
    t_serial = time.perf_counter() - t0

    t0 = time.perf_counter()
    parallel = score_all(records, workers=4)
    t_parallel = time.perf_counter() - t0

    assert parallel == serial  # same results, same order
    print(f"serial {t_serial:.2f}s, 4 processes {t_parallel:.2f}s")
```

Complexity: about `serial time / workers`, plus process start-up and pickling overhead. With tiny tasks, the overhead can make it slower than serial, so always measure.

#### Follow-ups

- **Inside FastAPI?** Create one long-lived `ProcessPoolExecutor` at startup (in the lifespan), and `await loop.run_in_executor(pool, score, record)`. Better still, for heavy jobs, use a queue and separate workers.
- **Is NumPy an option?** If the math can be vectorised, NumPy often beats multiprocessing outright, with no extra processes.

### First successful response wins {medium}

You can ask three redundant eligibility services for the same answer. Write `first_success(calls, timeout)` that starts all of them concurrently, returns the **first successful** result, ignores the ones that fail, cancels the rest once one succeeds, and raises `TimeoutError` if none succeeds in time.

#### Hints

1. Create tasks, then loop with `asyncio.as_completed(tasks)` or `asyncio.wait(..., return_when=FIRST_COMPLETED)`.
2. Wrap everything in `async with asyncio.timeout(timeout):`.
3. In a `finally`, cancel every task that is still running, so nothing leaks.

#### Solution

`as_completed` yields awaitables in completion order. Return the first one that doesn't raise. The `finally` cancels the losers, both on success and on timeout. This is the "hedged requests" pattern used to cut tail latency.

```python
import asyncio
from collections.abc import Awaitable, Callable


async def first_success(calls: list[Callable[[], Awaitable[str]]], timeout: float) -> str:
    tasks = [asyncio.create_task(call()) for call in calls]
    try:
        async with asyncio.timeout(timeout):
            for next_done in asyncio.as_completed(tasks):
                try:
                    return await next_done
                except Exception:
                    continue  # this service failed: wait for the next one
        raise TimeoutError("all services failed")
    finally:
        for t in tasks:
            t.cancel()


def service(name: str, delay: float, ok: bool = True) -> Callable[[], Awaitable[str]]:
    async def call() -> str:
        await asyncio.sleep(delay)
        if not ok:
            raise ConnectionError(name)
        return name

    return call


async def main() -> None:
    # The fastest service fails, the next fastest wins
    assert await first_success([service("a", 0.01, ok=False), service("b", 0.03), service("c", 0.2)], timeout=1) == "b"
    # Everything fails
    try:
        await first_success([service("a", 0.01, ok=False), service("b", 0.02, ok=False)], timeout=1)
        raise AssertionError
    except TimeoutError:
        pass
    # Too slow
    try:
        await first_success([service("slow", 1.0)], timeout=0.05)
        raise AssertionError
    except TimeoutError:
        pass


asyncio.run(main())
```

Complexity: it finishes at the latency of the fastest successful service, capped by `timeout`.

#### Follow-ups

- **Why cancel the losers?** They hold sockets and server capacity. Leaving them running wastes resources and can trigger "Task was destroyed but it is pending" warnings.
- **Cost concerns?** Hedging multiplies load. A common refinement sends the second request only if the first hasn't answered within the p95 latency.
