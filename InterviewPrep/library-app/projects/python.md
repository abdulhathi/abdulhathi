---
title: "steadfast: a typed resilience toolkit for Python"
summary: A small, fully typed Python library (retry with backoff and jitter, circuit breaker, rate limiter, timeouts) that works for both sync and async code, published to PyPI with 95%+ test coverage, strict type checking and docs.
time: 3–4 days of evenings
---

## What you will build

`steadfast` is a library other developers install with `pip install steadfast` (pick another name if it is taken on PyPI). It gives four building blocks for calling unreliable services:

- `@retry(...)`: retries with exponential backoff and full jitter, a time budget, and a predicate for which exceptions are retryable.
- `CircuitBreaker`: closed, open and half-open states, with a limit on trial calls while half-open.
- `RateLimiter`: a token bucket, usable as a decorator or a context manager.
- `timeout(...)`: a deadline that works for async code (`asyncio.timeout`) and documents what it cannot do for sync code.

Every piece works on plain functions and on `async def` functions, keeps the wrapped function's signature for type checkers, and takes an injectable clock so tests never sleep. A recruiter sees a real, installable package with a changelog, CI badges and docs. An interviewer sees decorators, closures, the descriptor protocol, generics, `asyncio` and testing done properly.

## What it proves

- Python language depth: decorators with arguments, `functools.wraps`, closures, context managers (sync and async), dataclasses, enums, `ParamSpec`/`TypeVar` generics (PEP 695 syntax)
- `asyncio`: coroutines vs functions, cancellation-safe sleeping, `asyncio.timeout`
- Packaging: `pyproject.toml`, `uv`, semantic versioning, publishing to TestPyPI and PyPI with trusted publishing
- Quality: pytest with parametrisation and fixtures, property-based tests with Hypothesis, `mypy --strict`, `ruff`, coverage gates in CI
- Keywords: Python 3.12+, type hints, asyncio, decorators, pytest, packaging, CI/CD, open source

## Architecture

```text
steadfast/
  ├─ clock.py         Clock protocol: monotonic(), sleep(), async_sleep()  ← tests inject FakeClock
  ├─ backoff.py       pure functions: exponential(), full_jitter(), decorrelated_jitter()
  ├─ retry.py         @retry → wraps sync or async callables, uses backoff + clock + predicate
  ├─ breaker.py       CircuitBreaker(state machine: CLOSED → OPEN → HALF_OPEN → CLOSED)
  ├─ ratelimit.py     RateLimiter(token bucket), decorator + (async) context manager
  └─ timeouts.py      timeout() for async; documented limits for sync code

caller ──► @rate_limited ──► @breaker ──► @retry ──► your function ──► flaky service
             (shed load)      (fail fast)   (try again,
                                             backing off)
```

## Milestones

### Milestone 1: project skeleton and CI

Goal: a repository that builds, type-checks and tests on every push.

- `uv init --lib steadfast`, Python 3.12+ (develop on your installed 3.14).
- Add `ruff`, `mypy --strict`, `pytest`, `pytest-asyncio` (or `anyio`'s plugin), `hypothesis`, `coverage`.
- GitHub Actions: lint, type-check and test on Python 3.12, 3.13 and 3.14.

Done when: an empty test passes in CI on three Python versions and the README shows the CI badge.

### Milestone 2: backoff and retry

- Pure backoff functions first, tested with Hypothesis (delays never exceed the cap and never go negative).
- `@retry(attempts=, base=, cap=, jitter=, retry_on=, budget=)` for sync functions, then async ones (detect with `inspect.iscoroutinefunction`).
- Injectable `Clock` so tests run instantly.

Done when: tests cover success after N failures, giving up and re-raising the last error, the time budget, non-retryable exceptions, and async cancellation (a cancelled task stops retrying).

### Milestone 3: circuit breaker

- States as an `Enum`, transitions in one method, a failure threshold and a reset timeout.
- Half-open allows a limited number of trial calls; success closes the breaker, failure re-opens it.
- Counts only real failures (a predicate), not, for example, validation errors.

Done when: a state-transition table in the README matches a parametrised test that walks every transition.

### Milestone 4: rate limiter and timeouts

- Token bucket with fractional refill, a decorator, and sync and async context managers.
- `timeout()` for async using `asyncio.timeout`; document that you cannot safely interrupt sync code in-thread.

Done when: tests prove the refill maths with a fake clock and that the async context manager releases correctly on exceptions.

### Milestone 5: docs and release

- Docs site (MkDocs Material) with a quick start, each primitive, and "composing them" examples.
- Publish 0.1.0 to TestPyPI, then PyPI, using GitHub's trusted publishing (no API token in secrets).
- `CHANGELOG.md` and a GitHub release.

Done when: `pip install steadfast` works in a fresh virtual environment and the docs site is live on GitHub Pages.

## Repository layout

```text
steadfast/
├─ src/steadfast/{__init__,clock,backoff,retry,breaker,ratelimit,timeouts}.py
├─ src/steadfast/py.typed
├─ tests/{test_backoff,test_retry,test_breaker,test_ratelimit,test_timeouts}.py
├─ docs/ (mkdocs)
├─ examples/httpx_client.py      retrying an HTTP call with all four primitives
├─ pyproject.toml
├─ .github/workflows/{ci,release}.yml
└─ README.md, CHANGELOG.md, LICENSE
```

## Tests and CI

- Unit tests for each primitive with a `FakeClock`; nothing sleeps for real.
- Property-based tests for backoff bounds and token-bucket invariants.
- Async tests for cancellation and exceptions inside context managers.
- `mypy --strict` must pass; a small `typing_checks.py` file proves decorated functions keep their signatures (`reveal_type`).
- CI: `ci.yml` runs ruff, mypy and pytest with `--cov --cov-fail-under=95` across the Python matrix; `release.yml` publishes on a version tag.

## README checklist

- Badges: CI, coverage, PyPI version, supported Python versions, license
- A 10-line quick start, and a diagram of how the primitives compose
- A "design decisions" section: why full jitter, why an injectable clock, why breakers count only some failures
- Comparison with existing libraries (tenacity, backoff, pybreaker) and when you would use them instead
- What you would do next

## Stretch goals

- OpenTelemetry events for retries and breaker state changes
- A shared-state rate limiter backed by Redis (connects to the Redis path)
- A `pytest` plugin that injects the fake clock automatically

## Talking about it in an interview

**60-second walkthrough:** "I wrote steadfast to practise the patterns I use when integrating external services, like the FedEx and submission APIs I've worked with. It has retry with exponential backoff and full jitter, a circuit breaker, a token-bucket rate limiter and async timeouts, and each works on sync and async functions without losing type information. Everything takes an injectable clock, so the whole suite runs in under a second. It's published on PyPI with strict typing and 95% coverage."

- **Why full jitter?** Without jitter, many clients retry in lockstep and hammer a recovering service; full jitter spreads retries out. AWS's analysis found full and decorrelated jitter performed best.
- **How do you keep the signature for type checkers?** `ParamSpec` and a `TypeVar` for the return type, plus `functools.wraps` for runtime metadata; async wrappers return `Awaitable[R]`.
- **Why not just use tenacity?** In production I would; the point was to understand the trade-offs. The README explains when tenacity is the better choice.

## LinkedIn post template

> I just published steadfast, a small, fully typed Python library for calling unreliable services: retry with backoff and jitter, a circuit breaker, a rate limiter and async timeouts.
> Building it was a deep dive into decorators, ParamSpec generics, asyncio cancellation and property-based testing.
> It's on PyPI with 95% test coverage and strict type checking. Feedback welcome: <repo link>
> #Python #OpenSource #asyncio

## Resume bullet

Built and published steadfast, a typed Python resilience library (retry with jitter, circuit breaker, rate limiter, async timeouts) on PyPI, with strict type checking, property-based tests and 95%+ coverage in CI.
