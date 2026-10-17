---
title: Functions, closures and decorators
goal: Explain parameters, scope, closures and decorators precisely, and write a decorator with arguments on the spot.
minutes: 45
---

"Write a decorator" is one of the most common live-coding requests in Python interviews. A timing decorator, a retry decorator and a cache decorator come up again and again. They test three things at once: functions are objects, closures capture variables, and `*args, **kwargs` forward any call.

Make sure you can write these three from memory, with `functools.wraps`, and explain each line:

- a plain decorator
- a decorator that takes arguments, which has three layers
- a closure that keeps state with `nonlocal`

## Functions are objects

A function is an object like any other. You can assign it to a name, store it in a dict, pass it as an argument and return it from another function. Functions that take or return functions are called **higher-order functions**.

```python
def shout(text: str) -> str:
    return text.upper()

def whisper(text: str) -> str:
    return text.lower()

handlers = {"loud": shout, "quiet": whisper}      # functions stored in a dict
assert handlers["loud"]("hi") == "HI"

def apply_twice(fn, value):
    return fn(fn(value))
assert apply_twice(lambda n: n * 3, 2) == 18

assert sorted(["bb", "a", "ccc"], key=len) == ["a", "bb", "ccc"]   # key= takes a function
```

## Parameters

| Syntax | Meaning |
|---|---|
| `def f(a, b=2)` | Positional-or-keyword, with a default |
| `def f(*args)` | Extra positional arguments, collected into a **tuple** |
| `def f(**kwargs)` | Extra keyword arguments, collected into a **dict** |
| `def f(a, /, b)` | Everything before `/` is **positional-only** (3.8+) |
| `def f(a, *, b)` | Everything after `*` is **keyword-only** |
| `f(*items, **options)` | At the call site, `*` and `**` **unpack** a sequence or a mapping |

```python
def create_claim(member_id: str, /, amount: float, *, currency: str = "USD", **meta) -> dict:
    return {"member": member_id, "amount": amount, "currency": currency, **meta}

claim = create_claim("M1", 120.0, currency="USD", source="portal")
assert claim == {"member": "M1", "amount": 120.0, "currency": "USD", "source": "portal"}

try:
    create_claim(member_id="M1", amount=1.0)      # member_id is positional-only
    raise AssertionError
except TypeError:
    pass

try:
    create_claim("M1", 1.0, "EUR")                # currency is keyword-only
    raise AssertionError
except TypeError:
    pass

def total(*amounts: float) -> float:
    return sum(amounts)
values = [10.0, 20.0]
assert total(*values) == 30.0                     # unpack at the call site
```

Keyword-only parameters make calls self-documenting: `send(msg, retry=True)` beats `send(msg, True)`. Positional-only parameters let you rename a parameter later without breaking callers.

## Scope: LEGB, `global` and `nonlocal`

Python looks names up in four scopes, in this order: **L**ocal, **E**nclosing function, **G**lobal (module) and **B**uilt-in. The rule that trips people up: **assigning** to a name anywhere in a function makes it local for the *whole* function, unless you declare it `global` or `nonlocal`.

```python
count = 0

def broken() -> None:
    try:
        print(count)      # count is local here because of the assignment below
        count = 1         # noqa: F841
    except UnboundLocalError:
        pass

broken()

def make_counter():
    n = 0
    def increment() -> int:
        nonlocal n        # rebind the enclosing function's variable
        n += 1
        return n
    return increment

c = make_counter()
c(); c()
assert c() == 3
```

## Closures

A **closure** is a function that remembers variables from the scope where it was defined, even after that outer function has returned. The captured variables live in "cells", which you can see in `fn.__closure__`.

The classic trap is **late binding**. A closure captures the *variable*, not its value at the time. Every lambda made in a loop sees the loop variable's **final** value. Fix it with a default argument, which is evaluated at definition time, or with `functools.partial`.

```python
from functools import partial

def multiplier(factor: int):
    def multiply(x: int) -> int:
        return x * factor          # factor is captured from the enclosing scope
    return multiply

triple = multiplier(3)
assert triple(5) == 15
assert triple.__closure__[0].cell_contents == 3

late = [lambda: i for i in range(3)]
assert [f() for f in late] == [2, 2, 2]          # every lambda sees the final i

bound = [lambda i=i: i for i in range(3)]        # default argument captures the value now
assert [f() for f in bound] == [0, 1, 2]

def power(base: int, exp: int) -> int:
    return base ** exp
square = partial(power, exp=2)                   # partial freezes some arguments
assert square(7) == 49
```

## `lambda`, `map`, `filter` and `reduce`

A `lambda` is an anonymous function limited to a single expression. It suits short `key=` functions; for anything longer, write a named `def`, which shows up in tracebacks with a real name. `map` and `filter` return lazy iterators. In modern Python, comprehensions are usually clearer. `functools.reduce` folds a sequence into a single value, but `sum`, `max`, `any` and `all` often say the same thing more plainly.

```python
from functools import reduce

nums = [1, 2, 3, 4]
assert list(map(lambda n: n * n, nums)) == [n * n for n in nums]
assert list(filter(lambda n: n % 2 == 0, nums)) == [n for n in nums if n % 2 == 0]
assert reduce(lambda acc, n: acc * n, nums, 1) == 24
```

## Decorators

A decorator is a callable that takes a function and returns a replacement. `@timer` above `def f` is exactly `f = timer(f)`. The replacement usually *wraps* the original: it runs code before and after, then calls the original with `*args, **kwargs`.

Always use **`functools.wraps`**. It copies the wrapped function's `__name__`, `__qualname__`, `__doc__`, `__module__`, annotations and type parameters, and sets `__wrapped__`. Without it, logging, debugging, FastAPI dependency inspection and `inspect.signature` all see the name `wrapper`.

```python
import functools
import time

def timer(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        try:
            return func(*args, **kwargs)
        finally:
            wrapper.last_seconds = time.perf_counter() - start
    wrapper.last_seconds = 0.0
    return wrapper

@timer
def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b

assert add(2, 3) == 5
assert add.__name__ == "add" and add.__doc__ == "Add two numbers."   # thanks to wraps
assert add.last_seconds >= 0
```

**Decorators with arguments** need one more layer. `@retry(times=3)` first *calls* `retry(times=3)`, which returns the actual decorator, which then receives the function.

```python
import functools

def repeat(times: int):                 # layer 1: takes the decorator's arguments
    def decorator(func):                # layer 2: takes the function
        @functools.wraps(func)
        def wrapper(*args, **kwargs):   # layer 3: runs on every call
            return [func(*args, **kwargs) for _ in range(times)]
        return wrapper
    return decorator

@repeat(times=3)
def ping() -> str:
    return "pong"

assert ping() == ["pong", "pong", "pong"]
```

**Stacking order.** Decorators are *applied* bottom-up and *run* top-down. `@a` above `@b` above `def f` means `f = a(b(f))`. A call enters `a`'s wrapper first.

```python
import functools

calls: list[str] = []

def tag(name: str):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            calls.append(name)
            return func(*args, **kwargs)
        return wrapper
    return decorator

@tag("auth")        # applied second, runs first
@tag("log")         # applied first, runs second
def view() -> str:
    calls.append("view")
    return "ok"

view()
assert calls == ["auth", "log", "view"]
```

**Built-in decorators worth naming:** `@functools.cache` and `@functools.lru_cache(maxsize=128)` (memoisation), `@functools.cached_property`, `@functools.singledispatch` (overloading by the type of the first argument), `@property`, `@classmethod`, `@staticmethod`, `@dataclass`, and `@contextlib.contextmanager`.

```python
import functools

@functools.lru_cache(maxsize=None)
def fib(n: int) -> int:
    return n if n < 2 else fib(n - 1) + fib(n - 2)

assert fib(80) == 23416728348467685          # instant: each n is computed once
info = fib.cache_info()
assert info.misses == 81 and info.currsize == 81
fib.cache_clear()
```

## Interview questions

### What is a decorator, and how does it work? {core}

A decorator is a function that takes a function and returns a new one, usually a wrapper that adds behaviour before or after the call. The `@decorator` syntax is shorthand for `func = decorator(func)`, applied once, when the function is defined. Inside, the wrapper accepts `*args, **kwargs` so it can forward any call, and it uses `functools.wraps` to keep the original name and docstring.

Typical uses are logging, timing, retries, caching, authorisation checks and registering routes, which is exactly what `@app.get("/patients")` does in FastAPI.

### How do you write a decorator that takes arguments? {core}

Add a third layer. The outer function takes the decorator's arguments and returns the real decorator. That decorator takes the function and returns the wrapper. So `@retry(times=3)` means `func = retry(times=3)(func)`.

```python
import functools

def require_role(role: str):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(user: dict, *args, **kwargs):
            if role not in user.get("roles", []):
                raise PermissionError(f"{role} required")
            return func(user, *args, **kwargs)
        return wrapper
    return decorator

@require_role("admin")
def delete_carrier_account(user: dict, account_id: str) -> str:
    return f"deleted {account_id}"

assert delete_carrier_account({"roles": ["admin"]}, "FX-1") == "deleted FX-1"
try:
    delete_carrier_account({"roles": ["viewer"]}, "FX-1")
    raise AssertionError
except PermissionError:
    pass
```

**Your angle:** the role-based Admin UI for carrier accounts in the Labels Web app at The Dot Corp is the same idea, enforced on the server side.

### Why use `functools.wraps`? {core}

Without it, the decorated function's metadata becomes the wrapper's: `__name__` is `"wrapper"`, the docstring is gone, and `inspect.signature` shows `(*args, **kwargs)`. That breaks logging, debugging, documentation and frameworks that inspect signatures. FastAPI, for example, reads parameters to build validation and OpenAPI docs. `wraps` copies `__name__`, `__qualname__`, `__doc__`, `__module__`, the annotations and type parameters, merges `__dict__`, and sets `__wrapped__`, which lets `inspect` see through to the original.

### What is a closure? {core}

A closure is an inner function that remembers variables from its enclosing function's scope after that function has returned. For example, `make_multiplier(3)` returns a function that still knows `factor = 3`. Python stores the captured variables in cells (`fn.__closure__`).

Closures give you private state without a class. They're how decorators remember the function they wrap, and how factory functions configure behaviour.

### What is the late-binding closure trap? {core}

Closures capture **variables, not values**. So `[lambda: i for i in range(3)]` creates three functions that all read `i` when *called*. By then the loop has finished, so they all return 2. Fix it by binding the current value at definition time with a default argument (`lambda i=i: i`) or with `functools.partial`. The same bug appears when you register callbacks in a loop.

### Explain the LEGB rule. {core}

LEGB is the order Python searches for a name: **L**ocal (the current function), **E**nclosing (any outer functions), **G**lobal (the module), then **B**uilt-in (`len`, `print`, ...). The first match wins.

The important corollary: if a function **assigns** to a name anywhere in its body, that name is local for the whole function. Reading it before the assignment raises `UnboundLocalError`. To rebind an outer variable, declare it `nonlocal` (enclosing function) or `global` (module). Shadowing built-ins, like naming a variable `list` or `id`, is a common source of confusing bugs.

### What is the difference between `global` and `nonlocal`?

`global x` makes assignments in the function rebind the **module-level** `x`. `nonlocal x` rebinds `x` in the **nearest enclosing function** scope. It's needed for closures that update state, like a counter. Neither is needed just to *read* an outer variable, or to *mutate* an outer mutable object (`items.append(...)`), because neither of those is an assignment. Heavy use of `global` is a design smell. Prefer passing values, returning results, or using a class.

### What do `*args` and `**kwargs` mean? {core}

In a function definition, `*args` collects extra positional arguments into a **tuple**, and `**kwargs` collects extra keyword arguments into a **dict**. At a call site, `*` unpacks an iterable into positional arguments and `**` unpacks a mapping into keyword arguments. Together they let a wrapper forward any call unchanged (`func(*args, **kwargs)`), which is essential for decorators and for subclasses passing arguments up to `super().__init__`. The names are a convention. The stars do the work.

### What are positional-only and keyword-only parameters? {deep}

Parameters before a `/` are **positional-only**: callers can't pass them by name, so you're free to rename them later, and they can't clash with `**kwargs` keys. Parameters after a bare `*` (or after `*args`) are **keyword-only**: callers must name them, which makes boolean flags readable (`export(data, compress=True)`). Many built-ins use positional-only parameters, for example `len(obj, /)`.

### When are default argument values evaluated?

Once, when the `def` statement executes, usually at import time. That's why a mutable default like `[]` or `{}` is shared between calls, and why `def log(at=datetime.now())` freezes the timestamp. Use `None` as the default and create the value inside the function.

### What do `@functools.cache` and `@lru_cache` do? What are the caveats? {core}

They **memoise** a function: results are stored in a dict keyed by the arguments, so repeat calls return instantly. `lru_cache(maxsize=128)` evicts the least recently used entries once full. `cache` (3.9+) is `lru_cache(maxsize=None)`, an unbounded cache. You get `cache_info()` and `cache_clear()`.

Caveats:

- Arguments must be **hashable**, so no lists or dicts.
- The function should be **pure**. Caching something that reads a database returns stale data.
- An unbounded cache can grow forever.
- On methods, the cache holds a reference to `self` and keeps instances alive. Use `cached_property` or a per-instance cache instead.

### Decorators run in which order when stacked? {deep}

They're applied **bottom-up**, from the one nearest the `def` outwards, and at call time the wrappers run **top-down**. `@auth` over `@log` over `def view` builds `view = auth(log(view))`. A call goes through auth's wrapper, then log's, then the function. Order matters: put authentication outside caching, so unauthorised users never get cached results. In FastAPI or Flask, the route decorator must be the **outermost** one, so it registers the fully decorated function.

### Can a class be a decorator? Can you decorate a class? {deep}

Yes to both. Any callable works as a decorator. A class with `__init__(self, func)` and `__call__(self, *args, **kwargs)` is handy when the decorator needs significant state. Use `functools.update_wrapper(self, func)` to copy the metadata. Note that a class-based decorator doesn't automatically bind as a method unless you implement `__get__`.

Decorating a **class** means a function that receives the class and returns it, possibly modified. `@dataclass` works this way: it adds `__init__`, `__repr__` and `__eq__`. Registration decorators that add the class to a plugin registry are another example.

### When should you use a lambda, and when not?

Use a lambda for short, throwaway functions passed as arguments, such as `sorted(rows, key=lambda r: r.age)`. Avoid it when the logic needs statements, when it's long, or when you're assigning it to a name. `f = lambda x: ...` is worse than `def f(x):`, because tracebacks and profilers show `<lambda>`. PEP 8 explicitly discourages assigning lambdas to names. `operator.itemgetter` and `attrgetter` are clean alternatives for key functions.

### What is `functools.partial` used for? {deep}

`partial(func, *args, **kwargs)` returns a new callable with some arguments pre-filled. Use it to adapt a function to an interface that expects fewer arguments, like a callback, `map`, or a thread pool. Use it to create specialised versions (`parse_date = partial(datetime.strptime, format=...)`). And use it to avoid the late-binding trap in loops. Unlike a lambda, it's picklable if the underlying function is, which matters for `multiprocessing`.

### What is `singledispatch`? {deep}

`@functools.singledispatch` turns a function into a **generic function** that picks an implementation by the **type of the first argument**. You register overloads with `@func.register`. It's a clean alternative to long `if isinstance(...)` chains, for example rendering different message types or serialising different domain objects. `singledispatchmethod` does the same for methods, dispatching on the first argument after `self`.

## Coding problems

### Write a timing decorator {easy core}

Write a decorator `timed` that measures how long a function takes and logs `"<name> took X ms"`. The decorated function must still return its normal result and keep its name and docstring. Bonus: the timing must be logged even if the function raises.

#### Hints

1. Use `time.perf_counter()`, which is monotonic and high resolution, rather than `time.time()`.
2. Wrap the call in `try`/`finally` so the timing is logged even on an exception.
3. Don't forget `functools.wraps`.

#### Solution

The wrapper records the start time, calls the original with `*args, **kwargs`, and logs in `finally`, so it runs on success *and* failure. Logging goes through the `logging` module, not `print`, which production code needs. The test captures log records with a handler.

```python
import functools
import logging
import time

log = logging.getLogger("timing")

def timed(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        try:
            return func(*args, **kwargs)
        finally:
            ms = (time.perf_counter() - start) * 1000
            log.info("%s took %.2f ms", func.__qualname__, ms)
    return wrapper

# --- tests ---
records: list[str] = []
class ListHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        records.append(record.getMessage())
log.addHandler(ListHandler())
log.setLevel(logging.INFO)

@timed
def slow_sum(n: int) -> int:
    """Sum 0..n-1."""
    return sum(range(n))

@timed
def fails() -> None:
    raise ValueError("boom")

assert slow_sum(1000) == 499500
assert slow_sum.__name__ == "slow_sum" and slow_sum.__doc__ == "Sum 0..n-1."
try:
    fails()
except ValueError:
    pass
assert records[0].startswith("slow_sum took ") and records[0].endswith(" ms")
assert records[1].startswith("fails took ")          # logged even though it raised
```

Complexity: O(1) overhead per call.

#### Follow-ups

- **Why `perf_counter` and not `time.time()`?** `time.time()` follows the wall clock, which can jump (NTP, daylight saving). `perf_counter` is monotonic and has the highest available resolution.
- **How would you time async functions?** Check `inspect.iscoroutinefunction(func)` and return an `async def wrapper` that does `return await func(...)`.
- **How would you send this to monitoring?** Record a histogram metric (Prometheus or OpenTelemetry) instead of only logging, labelled by function name.

### Retry with exponential backoff {medium core}

Write a decorator `retry(times=3, base_delay=0.1, exceptions=(Exception,))`. If the function raises one of `exceptions`, wait and try again. Each wait doubles (0.1 s, 0.2 s, 0.4 s, ...). After the last attempt, re-raise the final exception. Make it testable without real sleeping.

#### Hints

1. It takes arguments, so it needs three layers: `retry(...)` → `decorator(func)` → `wrapper(*args, **kwargs)`.
2. Loop over attempts. On an exception, re-raise if it's the last attempt, otherwise sleep for `base_delay * 2 ** attempt`.
3. Inject the sleep function as a parameter (default `time.sleep`), so tests can pass a fake that records delays.

#### Solution

Only catch the exception types you were told to catch. Retrying on *every* error would hide bugs like `TypeError`. Re-raise with a bare `raise` so the original traceback survives. Real systems add **jitter** (a random factor), so many clients don't retry in lockstep and overload a recovering service.

```python
import functools
import random
import time
from typing import Callable

def retry(times: int = 3, base_delay: float = 0.1, exceptions: tuple[type[BaseException], ...] = (Exception,),
          jitter: bool = False, sleep: Callable[[float], None] = time.sleep):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(times):
                try:
                    return func(*args, **kwargs)
                except exceptions:
                    if attempt == times - 1:
                        raise                              # out of attempts: keep the original traceback
                    delay = base_delay * 2 ** attempt
                    if jitter:
                        delay *= random.uniform(0.5, 1.5)
                    sleep(delay)
        return wrapper
    return decorator

# --- tests ---
waits: list[float] = []
attempts = {"n": 0}

@retry(times=4, base_delay=0.1, exceptions=(ConnectionError,), sleep=waits.append)
def flaky_submit() -> str:
    attempts["n"] += 1
    if attempts["n"] < 3:
        raise ConnectionError("payer API unavailable")
    return "accepted"

assert flaky_submit() == "accepted"
assert attempts["n"] == 3
assert waits == [0.1, 0.2]                    # doubled each time

waits.clear()
@retry(times=3, base_delay=1, exceptions=(ConnectionError,), sleep=waits.append)
def always_down() -> None:
    raise ConnectionError("down")
try:
    always_down()
    raise AssertionError("should have raised")
except ConnectionError:
    pass
assert waits == [1, 2]                        # 3 attempts → 2 waits

@retry(times=5, exceptions=(ConnectionError,), sleep=waits.append)
def bug() -> None:
    raise TypeError("a bug, not a transient failure")
waits.clear()
try:
    bug()
except TypeError:
    pass
assert waits == []                            # not retried
```

Complexity: at most `times` calls. The total wait is `base_delay · (2^(times−1) − 1)`.

#### Follow-ups

- **Which errors should you retry?** Transient ones: timeouts, connection errors, HTTP 429/502/503/504. Never retry 400 or 422, which won't change, and only retry non-idempotent operations (like POST) if the API supports idempotency keys.
- **What is jitter, and why add it?** Randomising delays spreads retries out, so thousands of clients don't hammer the service at the same moment (the "thundering herd").
- **What would you use in production?** The `tenacity` library or the HTTP client's built-in retries (for example `urllib3.Retry`), plus a cap on the maximum delay and a circuit breaker.

### Memoise a function without `functools` {medium}

Write a decorator `memoize` that caches results by arguments, including keyword arguments, without using `functools.cache`. Show that it turns a naive recursive Fibonacci from exponential into linear time.

#### Hints

1. Store results in a dict that lives in the decorator's closure.
2. The key must be hashable: combine `args` (a tuple) with a frozenset or sorted tuple of `kwargs.items()`.
3. Count calls to prove the speed-up.

#### Solution

The cache dict is created once per decorated function and captured by the wrapper's closure. The key `(args, tuple(sorted(kwargs.items())))` is hashable as long as the argument values are. A sentinel distinguishes "not cached" from a cached `None`.

```python
import functools

def memoize(func):
    cache: dict = {}
    missing = object()                                   # sentinel: a cached None is still a hit

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        key = (args, tuple(sorted(kwargs.items())))
        result = cache.get(key, missing)
        if result is missing:
            result = func(*args, **kwargs)
            cache[key] = result
        return result

    wrapper.cache = cache                                # expose for inspection/clearing
    return wrapper

calls = {"n": 0}

@memoize
def fib(n: int) -> int:
    calls["n"] += 1
    return n if n < 2 else fib(n - 1) + fib(n - 2)

assert fib(50) == 12586269025
assert calls["n"] == 51                                  # each n computed once (naive would be ~40 billion calls)

@memoize
def lookup(code: str, *, upper: bool = False) -> str | None:
    calls["n"] += 1
    return code.upper() if upper else None

calls["n"] = 0
assert lookup("e11", upper=True) == "E11"
assert lookup("e11", upper=True) == "E11"
assert lookup("x") is None and lookup("x") is None       # None results are cached too
assert calls["n"] == 2

try:
    lookup(["not", "hashable"])                          # lists can't be dict keys
    raise AssertionError
except TypeError:
    pass
```

Complexity: Fibonacci drops from O(φⁿ) calls to O(n) calls, using O(n) cache space.

#### Follow-ups

- **How would you bound memory?** Evict with an LRU policy, using `OrderedDict` with `move_to_end` and `popitem(last=False)`. That's what `lru_cache(maxsize=...)` does.
- **Is it thread-safe?** Dict operations are atomic in CPython, so it won't corrupt, but two threads can compute the same key at once. Add a lock if computation is expensive or has side effects.
- **Deep recursion?** `fib(5000)` would exceed the recursion limit. Use an iterative bottom-up version instead.

### A counter with a closure {easy}

Without using a class or a global variable, write `make_counter(start=0, step=1)`, which returns a function. Each call returns the next number. Then add a way to reset it.

#### Hints

1. The state lives in a variable of the outer function.
2. Updating it from the inner function requires `nonlocal`.
3. Functions can have attributes: attach `reset` to the returned function.

#### Solution

`nonlocal` lets the inner function rebind `current` in the enclosing scope. Without it, `current += step` would raise `UnboundLocalError`. Each call to `make_counter` creates a fresh, independent closure.

```python
def make_counter(start: int = 0, step: int = 1):
    current = start - step

    def counter() -> int:
        nonlocal current
        current += step
        return current

    def reset() -> None:
        nonlocal current
        current = start - step

    counter.reset = reset
    return counter

a = make_counter()
b = make_counter(start=10, step=5)
assert [a(), a(), a()] == [0, 1, 2]
assert [b(), b()] == [10, 15]          # independent state
a.reset()
assert a() == 0
```

Complexity: O(1) per call.

#### Follow-ups

- **When would you use a class instead?** When there are several operations or more state. A class with `__call__` reads better than many attached functions.
- **What does `itertools.count(start, step)` give you?** The same sequence as a ready-made iterator: `next(counter)`.

### Validate argument types at runtime {medium}

Write a decorator `enforce_types` that reads a function's type hints and raises `TypeError` if an argument doesn't match. Plain classes like `int`, `str` and `float` are enough. Arguments without a hint are not checked.

#### Hints

1. `inspect.signature(func).bind(*args, **kwargs)` maps every argument to its parameter name, including defaults (with `apply_defaults()`).
2. `typing.get_type_hints(func)` returns the annotations as real types.
3. Only check hints that are plain classes (`isinstance(hint, type)`), and skip the `return` hint.

#### Solution

Do the expensive introspection **once**, at decoration time, not on every call. `bind` raises `TypeError` for wrong argument counts, just like a normal call. In production you'd use Pydantic's `@validate_call` instead, but this shows you understand how such tools work.

```python
import functools
import inspect
import typing

def enforce_types(func):
    sig = inspect.signature(func)
    hints = {name: t for name, t in typing.get_type_hints(func).items()
             if name != "return" and isinstance(t, type)}

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        bound = sig.bind(*args, **kwargs)
        bound.apply_defaults()
        for name, value in bound.arguments.items():
            expected = hints.get(name)
            if expected is not None and not isinstance(value, expected):
                raise TypeError(f"{name} must be {expected.__name__}, got {type(value).__name__}")
        return func(*args, **kwargs)
    return wrapper

@enforce_types
def bill(member_id: str, amount: float, units: int = 1, note=None) -> float:
    return amount * units

assert bill("M1", 10.0, units=3) == 30.0
assert bill("M1", 2.5, note=123) == 2.5           # unannotated: not checked
for bad_call in (lambda: bill(42, 10.0), lambda: bill("M1", 10.0, units="3")):
    try:
        bad_call()
        raise AssertionError("expected TypeError")
    except TypeError as e:
        assert "must be" in str(e)
assert bill.__name__ == "bill"
```

Complexity: O(k) per call for k arguments. Signature parsing happens once.

#### Follow-ups

- **Note the `bool` trap.** `isinstance(True, int)` is True, because `bool` subclasses `int`, so `units=True` passes. Strict validators like Pydantic in strict mode reject it.
- **What about `list[int]` or `X | None`?** Those hints aren't plain classes. You'd need `typing.get_origin` and `get_args`, which is exactly what Pydantic implements.
- **How does FastAPI do this?** It inspects the endpoint's signature at startup, builds Pydantic models from the hints, and validates every request, returning 422 on failure.
