---
title: Errors, context managers, files and logging
goal: Handle failures the way a senior Python engineer does (specific exceptions, chaining, context managers, structured logging) and explain the try/except/else/finally flow precisely.
minutes: 40
---

Error handling shows interviewers whether you have run code in production. A junior answer is "wrap it in `try/except` and print the error." A senior answer catches **specific** exceptions at the right layer, keeps the original cause with `raise ... from`, cleans up with **context managers**, and **logs** with context but without leaking PHI.

This chapter covers the exception model, context managers, file and JSON/CSV handling, logging and exception groups. The coding problems are the kind you get in a practical round: a timer context manager, a tolerant CSV parser and retry with chaining.

## The exception hierarchy

```text
BaseException
 ├── SystemExit            (sys.exit)
 ├── KeyboardInterrupt     (Ctrl+C)
 ├── GeneratorExit
 ├── BaseExceptionGroup
 │    └── ExceptionGroup   (also inherits from Exception)
 └── Exception             ← catch this, never bare except / BaseException
      ├── ArithmeticError → ZeroDivisionError, OverflowError
      ├── LookupError     → KeyError, IndexError
      ├── ValueError      → UnicodeDecodeError, …
      ├── TypeError, AttributeError, NameError
      ├── OSError         → FileNotFoundError, PermissionError, TimeoutError, ConnectionError
      ├── RuntimeError    → RecursionError, NotImplementedError
      └── StopIteration, ImportError → ModuleNotFoundError, …
```

`except Exception` deliberately does **not** catch `KeyboardInterrupt` or `SystemExit`, so Ctrl+C and `sys.exit()` still work. A bare `except:` catches them, which is why linters flag it.

## How try / except / else / finally flows

```python
def flow(x: object) -> list[str]:
    steps: list[str] = []
    try:
        steps.append("try")
        value = 10 / x  # type: ignore[operator]
    except ZeroDivisionError:
        steps.append("except ZeroDivisionError")
    except TypeError:
        steps.append("except TypeError")
    else:
        steps.append(f"else (no exception) {value:g}")  # only runs when try succeeded
    finally:
        steps.append("finally")  # always runs: success, exception, return, break
    return steps


assert flow(2) == ["try", "else (no exception) 5", "finally"]
assert flow(0) == ["try", "except ZeroDivisionError", "finally"]
assert flow("a") == ["try", "except TypeError", "finally"]
```

- `except` clauses are checked **top to bottom**, so put specific exceptions before general ones.
- `else` runs only if the `try` block raised nothing. Put the "success path" code there, so its own errors aren't caught by mistake.
- `finally` always runs, even after `return`. A `return` inside `finally` swallows the exception, so never do that. Python 3.14 now emits a `SyntaxWarning` for `return`, `break` or `continue` in `finally` (PEP 765).

## Custom exceptions and chaining

```python
class ClaimError(Exception):
    """Base for this domain: callers can catch every claim error at once."""


class ClaimValidationError(ClaimError):
    def __init__(self, claim_id: str, field: str, reason: str) -> None:
        super().__init__(f"claim {claim_id}: {field} {reason}")
        self.claim_id, self.field, self.reason = claim_id, field, reason


def parse_amount(claim_id: str, raw: str) -> float:
    try:
        return float(raw)
    except ValueError as exc:
        # "from exc" keeps the original error as __cause__ in the traceback
        raise ClaimValidationError(claim_id, "amount", f"is not a number: {raw!r}") from exc


try:
    parse_amount("C9", "12,50")
except ClaimError as err:
    assert isinstance(err, ClaimValidationError) and err.field == "amount"
    assert isinstance(err.__cause__, ValueError)  # chained
```

- `raise New(...) from exc` sets `__cause__`, and the traceback says "The above exception was the direct cause…".
- Raising inside an `except` block **without** `from` still records `__context__` ("During handling of the above exception, another exception occurred"). That usually signals an accidental error inside the handler.
- `raise New(...) from None` hides the chain, which is useful when the internal detail is noise or sensitive.
- A bare `raise` inside `except` re-raises the current exception with its original traceback.

## Context managers

A context manager guarantees setup and teardown around a block: files close, locks release, transactions commit or roll back, even when an exception is raised. `with` calls `__enter__` at the start and `__exit__(exc_type, exc, tb)` at the end. If `__exit__` returns `True`, the exception is suppressed.

```python
import contextlib
import time
from collections.abc import Iterator


class Timer:
    def __enter__(self) -> "Timer":
        self.start = time.perf_counter()
        return self  # bound to the name after "as"

    def __exit__(self, exc_type, exc, tb) -> bool:
        self.elapsed = time.perf_counter() - self.start
        return False  # do not suppress exceptions


@contextlib.contextmanager
def transaction(log: list[str]) -> Iterator[None]:
    log.append("BEGIN")
    try:
        yield  # the body of the with-block runs here
    except Exception:
        log.append("ROLLBACK")
        raise
    else:
        log.append("COMMIT")


with Timer() as t:
    sum(range(1000))
assert t.elapsed >= 0

log: list[str] = []
with transaction(log):
    pass
try:
    with transaction(log):
        raise ValueError("bad row")
except ValueError:
    pass
assert log == ["BEGIN", "COMMIT", "BEGIN", "ROLLBACK"]

with contextlib.suppress(FileNotFoundError):  # an explicit, readable "ignore this one error"
    open("does-not-exist.txt")
```

`contextlib.ExitStack` manages a variable number of context managers, for example opening N files and guaranteeing that all of them close.

## Files, pathlib, JSON and CSV

```python
import csv
import io
import json
from pathlib import Path

path = Path("claims.json")
path.write_text(json.dumps([{"id": "C1", "amount": 120.5}]), encoding="utf-8")
data = json.loads(path.read_text(encoding="utf-8"))
assert data[0]["id"] == "C1"

with path.open("a", encoding="utf-8") as f:  # modes: r, w (truncate), a (append), x (create, fail if exists), b (binary)
    f.write("\n")

assert path.suffix == ".json" and path.stem == "claims"
path.unlink()

rows = list(csv.DictReader(io.StringIO("id,amount\nC1,10\nC2,20\n")))
assert rows == [{"id": "C1", "amount": "10"}, {"id": "C2", "amount": "20"}]  # csv gives strings: convert yourself

buf = io.StringIO()
writer = csv.DictWriter(buf, fieldnames=["id", "amount"])
writer.writeheader()
writer.writerow({"id": "C3", "amount": 30})
assert buf.getvalue().splitlines() == ["id,amount", "C3,30"]
```

- Always pass `encoding="utf-8"`. Without it, the default depends on the platform. (Python 3.15 makes UTF-8 the default, per PEP 686.)
- Iterate a file line by line (`for line in f`) for big files. `read()` loads everything into memory.
- When opening CSV files for the `csv` module, use `newline=""`, as its docs say.

## Logging done right

```python
import logging

logger = logging.getLogger("claims.ingest")  # one logger per module: logging.getLogger(__name__)


class ListHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


handler = ListHandler()
logger.addHandler(handler)
logger.setLevel(logging.INFO)

logger.debug("not shown: below INFO")
logger.info("processed %d claims for batch %s", 42, "B7")  # lazy %-formatting: no work if the level is off
try:
    1 / 0
except ZeroDivisionError:
    logger.exception("failed to price claim %s", "C9")  # ERROR level + traceback

assert [r.levelname for r in handler.records] == ["INFO", "ERROR"]
assert handler.records[0].getMessage() == "processed 42 claims for batch B7"
assert handler.records[1].exc_info is not None
```

- Use `logging`, not `print`. It gives you levels (DEBUG, INFO, WARNING, ERROR, CRITICAL), handlers (console, file, cloud), formatters and per-module control.
- Configure logging **once**, at the application entry point (`logging.basicConfig` or `dictConfig`). Libraries only call `getLogger(__name__)`.
- Pass arguments (`logger.info("id %s", x)`) rather than f-strings, so formatting is skipped when the level is disabled, and log aggregators can group messages.
- In production, emit **structured JSON logs** with a correlation or request ID. In healthcare, **never log PHI**: log the claim ID, not the member's name or DOB.

## Exception groups (3.11+)

When several tasks fail at once (for example in `asyncio.TaskGroup`), Python raises an `ExceptionGroup`. `except*` handles each type inside it separately.

```python
def run() -> None:
    raise ExceptionGroup("batch failed", [ValueError("bad npi"), TimeoutError("payer api"), ValueError("bad dob")])


handled: list[str] = []
try:
    run()
except* ValueError as group:
    handled.append(f"validation x{len(group.exceptions)}")
except* TimeoutError as group:
    handled.append(f"timeouts x{len(group.exceptions)}")
assert handled == ["validation x2", "timeouts x1"]
```

## Interview questions

### Explain try / except / else / finally. {core}

`try` holds the code that might fail. An `except` clause handles a specific exception type, and clauses are checked in order, so the most specific comes first. `else` runs **only if no exception was raised**: it holds the success-path code, kept outside `try` so you don't accidentally catch its errors. `finally` **always** runs, whether the block succeeded, raised an exception, or returned, and it is for cleanup.

The follow-up is usually "what if `finally` has a `return`?" It overrides the earlier return and **silently swallows any exception**, so never return from `finally`. Python 3.14 warns about it.

### Why is a bare `except:` (or `except Exception: pass`) bad? {core}

A bare `except:` catches `BaseException`, including `KeyboardInterrupt` and `SystemExit`, so Ctrl+C and clean shutdowns stop working. `except Exception: pass` is better but still **swallows bugs silently**: a typo raising `NameError` looks like success.

Catch the narrowest exception you can handle meaningfully, at the layer that knows what to do about it. If you must catch broadly, at a top-level request handler or a worker loop, **log it with the traceback** (`logger.exception`) and re-raise, or convert it to a proper error response.

### When do you create custom exceptions? How do you design them? {core}

Create them when callers need to react to **domain** failures differently from generic ones, for example `ClaimValidationError` vs `PayerUnavailableError`. Design a small hierarchy with one base per package (`ClaimError(Exception)`) so callers can catch everything from your code at once. Put useful attributes on the exception (`claim_id`, `field`), not just a message. Subclass a built-in when the meaning matches, for example `class InvalidNpi(ValueError)`, so generic handlers still work.

In FastAPI, register an exception handler that maps your domain errors to HTTP responses: validation errors to 422 and not-found to 404.

### What is exception chaining? `raise X from Y` vs `from None`? {core}

When you translate a low-level error into a domain error, `raise ClaimError(...) from exc` stores the original as `__cause__`, and the traceback shows both: "the above exception was the direct cause". You keep the debugging detail while exposing a clean domain error.

If you raise inside an `except` block without `from`, Python still records the original as `__context__`, but the message reads as if the handler itself broke. `from None` suppresses the chain entirely. Use it when the internal error is noise or might leak details such as a connection string.

### EAFP vs LBYL? {core}

**LBYL**, "look before you leap": check first (`if key in d: return d[key]`). **EAFP**, "easier to ask forgiveness than permission": just try, and handle the failure (`try: return d[key] except KeyError: ...`). Python idiom favours EAFP because it avoids race conditions (the file can disappear between `os.path.exists` and `open`), avoids checking twice, and reads clearly when the failure is rare.

Use LBYL when failure is common (exceptions are slower than an `if` when they actually fire) or when the check is cheap and clearer, as with `d.get(key, default)`.

### What is a context manager and how do you write one? {core}

It is an object that sets something up and **guarantees teardown** around a `with` block, even if the block raises. Examples: closing files, releasing locks, committing or rolling back a transaction, restoring settings.

There are two ways to write one:

1. A class with `__enter__` (returns the value bound by `as`) and `__exit__(exc_type, exc, tb)`. If `__exit__` returns `True`, the exception is suppressed.
2. `@contextlib.contextmanager` on a generator. Code before `yield` is setup, and code after it is teardown. Wrap the `yield` in `try/finally` (or `except`/`else`) so teardown runs when the block raises.

**Your angle:** a database session dependency in FastAPI (`yield` the session, then commit or roll back) is the same pattern.

### What does `__exit__` receive, and what does its return value mean? {deep}

It receives the exception type, the exception instance and the traceback, or three `None`s if the block finished normally. If it returns a truthy value, the exception is **suppressed** and execution continues after the `with`. If it returns `False` or `None`, the exception propagates. Suppress only on purpose, as `contextlib.suppress(FileNotFoundError)` does. A context manager that always returns `True` hides bugs.

### What are `contextlib.suppress` and `ExitStack` for? {deep}

`suppress(*exceptions)` is a readable way to say "ignore exactly this error here", for example deleting a file that may not exist. `ExitStack` lets you enter a **dynamic number** of context managers and guarantees that every one is exited in reverse order. Typical uses: opening a list of files, or conditionally adding a lock or transaction. It also offers `callback()` to register arbitrary cleanup functions.

### How do you read a very large file without running out of memory? {core}

Iterate it lazily: `with open(path, encoding="utf-8") as f: for line in f: ...` reads one buffered line at a time, so memory stays constant. Combine it with generator functions to build a pipeline (parse, filter, aggregate). For binary data, read fixed-size chunks with `f.read(65536)` in a loop. For CSV, `csv.reader` or `DictReader` wrap the file object lazily too. In pandas, `read_csv(chunksize=...)` yields DataFrames in batches.

Avoid `f.read()` and `f.readlines()`, which load the whole file into memory.

### Why always pass `encoding=` to `open()`? {deep}

Without it, Python uses the platform's locale encoding. That is UTF-8 on most Linux and macOS systems, but historically cp1252 on Windows, so the same code can read a file correctly on one machine and garble or crash on another (`UnicodeDecodeError`). Passing `encoding="utf-8"` makes the behaviour explicit and portable. PEP 686 makes UTF-8 mode the default in Python 3.15. Until then, be explicit.

### How should logging be set up in a Python service? {core}

Each module gets its own logger with `logging.getLogger(__name__)`. Configuration (levels, handlers, format) happens **once**, at the entry point, with `dictConfig` or `basicConfig`. Use levels deliberately: DEBUG for diagnostics, INFO for business events, WARNING for recoverable oddities, ERROR for failures (`logger.exception` inside `except` adds the traceback).

In production: structured JSON output to stdout so the platform collects it (Cloud Logging, Azure Monitor), a correlation or request ID on every line, lazy `%s` arguments instead of f-strings, and **no PHI or secrets in logs**. Log identifiers, not names, DOBs or member numbers in free text.

**Your angle:** on Cloud Run, stdout and stderr go straight to Cloud Logging. Structured logs that carry a document ID are what let you trace one document through ingestion, validation and review.

### What is the difference between `logger.error` and `logger.exception`? {deep}

Both log at ERROR level. `logger.exception(msg)` must be called from inside an `except` block, and it automatically attaches the current traceback (`exc_info=True`). Use `logger.exception` when you catch an unexpected error. Use `logger.error` for an error condition that isn't an exception, or when the traceback adds nothing.

### What are exception groups and `except*`? {deep}

Since 3.11, an `ExceptionGroup` bundles several exceptions raised together. The typical source is `asyncio.TaskGroup` when several tasks fail. `except* ValueError as eg:` handles just the `ValueError`s inside the group, `eg.exceptions` lists them, and other types continue to the next `except*` clause or propagate. Several `except*` clauses can each run for the same group, unlike normal `except`, where only the first match runs.

### Should you catch exceptions close to where they happen or at the top? {core}

Both, for different reasons. Catch **low** only when you can actually handle the error there: retry a transient network error, fall back to a default, or translate it into a domain exception with `from`. Otherwise let it **propagate** to a boundary (an API handler, a message consumer or a CLI entry point), where one place logs it with context and turns it into a response, a dead-letter message or an exit code. Catching and re-raising at every layer just adds noise.

### How do you retry safely? {core}

Retry only errors that are **transient** and operations that are **idempotent**, for example timeouts, connection resets, HTTP 429 and 503, and GET requests. Never retry a 400 validation error, and be careful with a POST that might have succeeded. Use **exponential backoff with jitter**, a maximum number of attempts, and a total deadline. Log each retry, and re-raise the last error when attempts run out. For writes, add an **idempotency key**, so a retried submission is processed once. Libraries such as `tenacity` implement this, and the coding problem below writes it by hand.

### What happens to exceptions raised in threads or async tasks? {deep}

A thread's exception does not propagate to the main thread. By default it is printed via `threading.excepthook`, and with `concurrent.futures` it is stored in the `Future` and re-raised when you call `.result()`. An asyncio task's exception is stored in the task and raised when you `await` it. If nobody awaits it, you get a "Task exception was never retrieved" warning. `asyncio.gather(return_exceptions=True)` returns exceptions as values, while `TaskGroup` cancels the remaining tasks and raises an `ExceptionGroup`.

### `assert` for validation: good or bad? {deep}

Bad for runtime validation. Assertions are **removed** when Python runs with `-O`, so checks on user input or API data would silently disappear. Use `assert` for internal invariants and in tests. Validate input with explicit `if ...: raise ValueError(...)`, or with Pydantic models at the boundary.

## Coding problems

### Timer context manager, two ways {easy core}

Write a context manager `timer(label, sink)` that measures how long the `with` block takes and appends `(label, seconds)` to the list `sink`. It must record the time **even if the block raises**, and it must not swallow the exception. Write it once with `@contextmanager` and once as a class.

#### Hints

1. Use `time.perf_counter()`, which is monotonic and high-resolution, not `time.time()`.
2. In the generator version, put the recording in `finally` around the `yield`.
3. In the class version, `__exit__` should return `False`, so exceptions propagate.

#### Solution

The `finally` is the key point: without it, an exception in the block skips the recording. Both versions are equivalent. The class version is easier to extend with state (like `elapsed` as an attribute), and the generator version is shorter.

```python
import time
from collections.abc import Iterator
from contextlib import contextmanager


@contextmanager
def timer(label: str, sink: list[tuple[str, float]]) -> Iterator[None]:
    start = time.perf_counter()
    try:
        yield
    finally:
        sink.append((label, time.perf_counter() - start))


class Timer:
    def __init__(self, label: str, sink: list[tuple[str, float]]) -> None:
        self.label, self.sink = label, sink

    def __enter__(self) -> "Timer":
        self.start = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        self.elapsed = time.perf_counter() - self.start
        self.sink.append((self.label, self.elapsed))
        return False


for make in (timer, Timer):
    sink: list[tuple[str, float]] = []
    with make("ok", sink):
        time.sleep(0.01)
    try:
        with make("boom", sink):
            raise KeyError("x")
    except KeyError:
        pass  # the exception was not swallowed
    assert [label for label, _ in sink] == ["ok", "boom"]
    assert sink[0][1] >= 0.009
```

Complexity: O(1) overhead.

#### Follow-ups

- **Use it as a decorator too?** `contextlib.ContextDecorator` (or a `@contextmanager` function, whose result can be used as a decorator) lets `@timer("x", sink)` wrap a function.
- **Async?** Use `@contextlib.asynccontextmanager` with `async with`.

### Tolerant claims CSV parser {medium core}

You get a claims CSV as text with columns `claim_id,member_id,amount,service_date`. Parse it into dicts with `amount` as `Decimal` and `service_date` as `date`. Bad rows (missing fields, non-numeric amount, invalid date, negative amount) must **not** stop the import. Skip them, and return a list of `(line_number, reason)` errors alongside the good rows. Line numbers count the header as line 1.

#### Hints

1. `csv.DictReader(io.StringIO(text))` gives one dict per row. Use `enumerate(reader, start=2)` for line numbers.
2. Validate inside a `try` per row. Convert with `Decimal(...)` and `date.fromisoformat(...)`, and catch only the exceptions they raise (`InvalidOperation`, `ValueError`).
3. Raise your own `RowError` for business rules (like a negative amount), so one `except` handles every reason.

#### Solution

This tests per-row error isolation, catching **specific** exceptions, and returning errors as data instead of printing them. That is how a real ingestion job behaves: good rows load, bad rows are reported for review.

```python
import csv
import io
from datetime import date
from decimal import Decimal, InvalidOperation


class RowError(ValueError):
    pass


REQUIRED = ("claim_id", "member_id", "amount", "service_date")


def parse_row(row: dict[str, str | None]) -> dict[str, object]:
    missing = [f for f in REQUIRED if not (row.get(f) or "").strip()]
    if missing:
        raise RowError(f"missing {', '.join(missing)}")
    try:
        amount = Decimal(row["amount"].strip())  # type: ignore[union-attr]
    except InvalidOperation:
        raise RowError(f"amount is not a number: {row['amount']!r}") from None
    if not amount.is_finite():  # Decimal accepts "NaN" and "Infinity"; comparing NaN would raise
        raise RowError(f"amount is not a number: {row['amount']!r}")
    if amount < 0:
        raise RowError("amount is negative")
    try:
        service_date = date.fromisoformat(row["service_date"].strip())  # type: ignore[union-attr]
    except ValueError:
        raise RowError(f"bad date: {row['service_date']!r}") from None
    return {"claim_id": row["claim_id"].strip(), "member_id": row["member_id"].strip(),  # type: ignore[union-attr]
            "amount": amount, "service_date": service_date}


def parse_claims(text: str) -> tuple[list[dict[str, object]], list[tuple[int, str]]]:
    good: list[dict[str, object]] = []
    errors: list[tuple[int, str]] = []
    for line_no, row in enumerate(csv.DictReader(io.StringIO(text)), start=2):
        try:
            good.append(parse_row(row))
        except RowError as exc:
            errors.append((line_no, str(exc)))
    return good, errors


text = """claim_id,member_id,amount,service_date
C1,M1,120.50,2026-09-01
C2,M2,abc,2026-09-02
C3,,10,2026-09-03
C4,M4,-5,2026-09-04
C5,M5,99,2026-02-30
C6,M6,0,2026-09-06
"""
good, errors = parse_claims(text)
assert [g["claim_id"] for g in good] == ["C1", "C6"]
assert good[0]["amount"] == Decimal("120.50") and good[0]["service_date"] == date(2026, 9, 1)
assert errors == [
    (3, "amount is not a number: 'abc'"),
    (4, "missing member_id"),
    (5, "amount is negative"),
    (6, "bad date: '2026-02-30'"),
]
assert parse_claims("claim_id,member_id,amount,service_date\n") == ([], [])
assert parse_claims("claim_id,member_id,amount,service_date\nC7,M7,NaN,2026-09-07\n") == ([], [(2, "amount is not a number: 'NaN'")])
```

Complexity: O(n) time over the rows. Memory is O(n) for the results. Stream the rows with a generator if the file is huge.

#### Follow-ups

- **A 5 GB file?** Open the file and pass it to `DictReader` directly, which streams it. Yield good rows to a batch writer, and write the errors to a rejects file.
- **Pydantic instead?** A `ClaimRow(BaseModel)` with `Decimal`, `date` and a `Field(ge=0)` constraint replaces `parse_row`. Catch `ValidationError` and use `exc.errors()` for per-field reasons.

### Retry with backoff and proper chaining {medium core}

Write `retry_call(fn, *, attempts, retry_on, base_delay, sleep)` that calls `fn()`. If it raises one of the `retry_on` exception types, wait `base_delay * 2**i` and try again, up to `attempts` total tries. Any other exception propagates immediately. When all attempts fail, raise `RetryError` chained **from** the last exception, with the attempt count on it. `sleep` is injected so tests don't actually wait.

#### Hints

1. Loop `for i in range(attempts)`, and `return fn()` on success.
2. `except retry_on as exc:` accepts a tuple of exception types. Remember `exc` in a variable that lives outside the `except` block, because Python deletes the name `exc` when the block ends.
3. After the loop: `raise RetryError(...) from last_exc`.

#### Solution

The details interviewers look for: only listed exceptions are retried, there is no sleep after the final attempt, the original error is preserved via `from`, and the clock is injectable for tests.

```python
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")


class RetryError(Exception):
    def __init__(self, attempts: int) -> None:
        super().__init__(f"gave up after {attempts} attempts")
        self.attempts = attempts


def retry_call(
    fn: Callable[[], T],
    *,
    attempts: int = 3,
    retry_on: tuple[type[BaseException], ...] = (ConnectionError, TimeoutError),
    base_delay: float = 0.5,
    sleep: Callable[[float], None],
) -> T:
    last_exc: BaseException | None = None
    for i in range(attempts):
        try:
            return fn()
        except retry_on as exc:
            last_exc = exc
            if i < attempts - 1:
                sleep(base_delay * 2**i)
    raise RetryError(attempts) from last_exc


# A flaky payer API: fails twice, then succeeds.
calls = {"n": 0}


def flaky() -> str:
    calls["n"] += 1
    if calls["n"] < 3:
        raise TimeoutError("payer api timeout")
    return "ok"


waits: list[float] = []
assert retry_call(flaky, attempts=5, base_delay=0.1, sleep=waits.append) == "ok"
assert waits == [0.1, 0.2]

waits.clear()
try:
    retry_call(lambda: (_ for _ in ()).throw(ConnectionError("down")), attempts=3, base_delay=1, sleep=waits.append)
    raise AssertionError
except RetryError as err:
    assert err.attempts == 3 and isinstance(err.__cause__, ConnectionError)
    assert waits == [1, 2]  # no sleep after the last attempt

try:
    retry_call(lambda: int("x"), sleep=waits.append)  # ValueError is not retried
    raise AssertionError
except ValueError:
    pass
```

Complexity: at most `attempts` calls. Total waiting is `base_delay * (2**(attempts-1) - 1)`.

#### Follow-ups

- **Add jitter.** Use `sleep(random.uniform(0, base_delay * 2**i))` ("full jitter"), so many clients don't retry in lockstep and hammer a recovering service.
- **As a decorator?** Wrap `retry_call` in a decorator factory, `@retry(attempts=3)`, using `functools.wraps`.
- **Async version?** Same loop with `await fn()` and `await asyncio.sleep(...)`.

### Atomic file write {medium}

Write a context manager `atomic_write(path)` that yields a writable text file. Readers must never see a half-written file: write to a temporary file in the same directory, and only on success replace the target in one step. If the block raises, the original file must be untouched and the temp file deleted.

#### Hints

1. `tempfile.NamedTemporaryFile(dir=path.parent, delete=False, mode="w", encoding="utf-8")`. It must be in the same directory (the same filesystem) for the replace to be atomic.
2. `os.replace(tmp, path)` is atomic on POSIX and Windows when both paths are on the same filesystem.
3. Use `try/except BaseException` around the `yield`: on failure, close and delete the temp file, then re-raise.

#### Solution

This combines context managers, cleanup on failure and file-system knowledge. `os.replace` overwrites the destination atomically, so a reader sees either the old content or the new content, never a partial write. For durability across a power loss, also `flush()` and `os.fsync()` before the replace.

```python
import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import TextIO


@contextmanager
def atomic_write(path: Path) -> Iterator[TextIO]:
    tmp = tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False, encoding="utf-8", suffix=".tmp")
    try:
        yield tmp
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp.close()
        os.replace(tmp.name, path)
    except BaseException:
        tmp.close()
        os.unlink(tmp.name)
        raise


target = Path("report.json")
with atomic_write(target) as f:
    f.write('{"version": 1}')
assert target.read_text(encoding="utf-8") == '{"version": 1}'

try:
    with atomic_write(target) as f:
        f.write('{"version": 2, "half')
        raise RuntimeError("crash mid-write")
except RuntimeError:
    pass
assert target.read_text(encoding="utf-8") == '{"version": 1}'  # untouched
assert not list(Path(".").glob("*.tmp"))  # temp file cleaned up
target.unlink()
```

Complexity: O(size of the content) to write.

#### Follow-ups

- **Why `BaseException` here?** Cleanup should also happen on `KeyboardInterrupt`. Re-raising keeps the behaviour correct, so this is one of the rare places where catching `BaseException` is right.
- **Where does this matter?** In config files, checkpoints and exported reports. Any file another process may read while you write it.
