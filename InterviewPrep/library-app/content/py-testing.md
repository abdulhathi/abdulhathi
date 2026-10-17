---
title: Testing with pytest
goal: Write clean pytest tests with fixtures, parametrisation and mocks, test FastAPI endpoints and async code, and explain your testing strategy like a senior engineer.
minutes: 45
---

Testing questions show up in almost every senior interview, and they are also a chance to score in the coding round:
when you finish a solution, writing two or three quick asserts or a parametrised test without being asked signals
seniority. Interviewers want to hear a strategy (what you test at which level, what you mock and why), not just
syntax.

Every block in this chapter is a real pytest file: it runs pytest on itself with
`pytest.main([__file__, "-q", "-p", "no:cacheprovider"])` and checks the exit code, so the tests you read are tests
that pass.

**Your angle:** at Medidata you worked with automated CI/CD (GitHub Actions, AWS CodePipeline) and test suites using
Cypress and Cucumber; at Quantiphi you shipped FastAPI services through Dev, SIT and UAT.

## The test pyramid

| Level | What it checks | Speed | How many | Python tools |
|---|---|---|---|---|
| **Unit** | One function or class, with collaborators replaced | Milliseconds | Most | pytest, unittest.mock |
| **Integration** | Real pieces together: API + database, service + queue | Seconds | Some | pytest + TestClient, a test database, Testcontainers |
| **End-to-end** | The whole system through the UI or public API | Slow | Few, critical paths only | Playwright, Cypress |

Many fast unit tests, fewer integration tests, a handful of end-to-end tests. Most of the confidence per minute comes
from the bottom two layers.

## pytest basics

pytest finds files named `test_*.py` (or `*_test.py`), functions named `test_*` and classes named `Test*`. You write
plain `assert` statements, and when one fails pytest shows the values on both sides.

```python
import pytest


def copay(visit_type: str, deductible_met: bool) -> float:
    if visit_type not in {"primary", "specialist", "er"}:
        raise ValueError(f"unknown visit type: {visit_type}")
    base = {"primary": 25.0, "specialist": 50.0, "er": 250.0}[visit_type]
    return base * 0.5 if deductible_met else base


def test_primary_care_copay():
    assert copay("primary", deductible_met=False) == 25.0


def test_copay_is_halved_after_deductible():
    assert copay("er", deductible_met=True) == 125.0


def test_unknown_visit_type_raises():
    with pytest.raises(ValueError, match="unknown visit type"):
        copay("dental", deductible_met=False)


def test_floats_compare_with_approx():
    assert 0.1 + 0.2 == pytest.approx(0.3)      # never compare floats with == directly


if __name__ == "__main__":
    assert pytest.main([__file__, "-q", "-p", "no:cacheprovider"]) == 0
```

## Fixtures: setup and teardown done right

A **fixture** is a function that prepares something a test needs. A test asks for it by naming it as a parameter.
Code after `yield` is the teardown, and it runs even if the test fails. The **scope** decides how often the fixture
is created.

| Scope | Created once per | Typical use |
|---|---|---|
| `function` (default) | Test | Fresh, isolated data |
| `class` / `module` | Class / file | Something moderately expensive shared within a file |
| `package` / `session` | Package / whole test run | A database engine, a Docker container, a loaded ML model |

Fixtures used across many files go in a **`conftest.py`** file: pytest loads it automatically for every test in that
directory and below, with no import needed.

```python
import pytest

events: list[str] = []


class InMemoryRepo:
    def __init__(self) -> None:
        self.rows: dict[int, dict] = {}

    def add(self, row: dict) -> None:
        self.rows[row["id"]] = row


@pytest.fixture(scope="module")
def config() -> dict:
    events.append("config created")         # once for the whole file
    return {"max_claim": 10_000}


@pytest.fixture
def repo():
    r = InMemoryRepo()                       # fresh for every test: tests cannot affect each other
    r.add({"id": 1, "member": "M1"})
    yield r
    events.append("repo cleaned up")         # teardown, runs even if the test fails


@pytest.fixture
def make_claim():
    """A factory fixture: lets each test build the objects it needs."""
    def make(amount: float = 100.0, status: str = "submitted") -> dict:
        return {"amount": amount, "status": status}
    return make


def test_repo_starts_with_one_row(repo, config):
    assert len(repo.rows) == 1 and config["max_claim"] == 10_000


def test_adding_does_not_leak_between_tests(repo, config):
    repo.add({"id": 2, "member": "M2"})
    assert len(repo.rows) == 2


def test_factory(make_claim):
    assert make_claim(amount=5)["amount"] == 5 and make_claim()["status"] == "submitted"


def test_builtin_fixtures(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")                 # undone automatically after the test
    f = tmp_path / "claims.csv"                          # a unique temporary directory per test
    f.write_text("id,amount\n1,100\n")
    assert f.read_text().splitlines()[1] == "1,100"


def test_fixture_lifecycle():                            # pytest runs tests in file order, so this is last
    assert events.count("config created") == 1           # module scope: created once
    assert events.count("repo cleaned up") == 2          # function scope: once per test that used it


if __name__ == "__main__":
    assert pytest.main([__file__, "-q", "-p", "no:cacheprovider"]) == 0
```

Other built-in fixtures worth naming: `capsys` (captured print output), `caplog` (captured log records),
`monkeypatch` (set attributes, environment variables, dict items, undone after the test), `tmp_path` (a temporary
directory).

## Parametrisation and marks

`@pytest.mark.parametrize` runs one test function over many inputs, each reported as its own test. It is the cleanest
way to cover edge cases.

```python
import pytest


def normalise_phone(raw: str) -> str:
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        raise ValueError("not a US phone number")
    return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("562-555-0142", "(562) 555-0142"),
        ("(562) 555 0142", "(562) 555-0142"),
        ("+1 562 555 0142", "(562) 555-0142"),
        ("5625550142", "(562) 555-0142"),
    ],
    ids=["dashes", "brackets", "country-code", "digits-only"],
)
def test_valid_numbers(raw, expected):
    assert normalise_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "123", "562-555-01425", "2 562 555 0142"])
def test_invalid_numbers(raw):
    with pytest.raises(ValueError):
        normalise_phone(raw)


@pytest.mark.skip(reason="example of skipping a test")
def test_not_ready():
    raise AssertionError("never runs")


@pytest.mark.xfail(reason="extensions are not supported yet", strict=True)
def test_extension():
    assert normalise_phone("562-555-0142 x12") == "(562) 555-0142 x12"


if __name__ == "__main__":
    assert pytest.main([__file__, "-q", "-p", "no:cacheprovider"]) == 0
```

Useful marks: `skip`, `skipif(condition, reason=...)`, `xfail` (expected to fail; `strict=True` makes an unexpected
pass an error), and your own marks such as `@pytest.mark.integration`, selected with `pytest -m integration` (register
custom marks in `pyproject.toml` to avoid warnings).

## Mocking

Replace a collaborator when it is slow, non-deterministic or has side effects: an HTTP API, email, the clock, a
payment gateway. `unittest.mock` is in the standard library.

| Term | Meaning |
|---|---|
| **Stub** | Returns canned answers |
| **Mock** | A stub that also records calls so you can assert on them |
| **Fake** | A working lightweight implementation (an in-memory repository, SQLite instead of PostgreSQL) |
| **Spy** | Wraps the real thing and records calls |

```python
import sys
from unittest.mock import MagicMock, create_autospec, patch

import pytest


# --- code under test: eligibility.py would look like this ---
class PayerClient:
    def check(self, member_id: str) -> dict:
        raise RuntimeError("real network call: must not run in unit tests")


def is_covered(client: PayerClient, member_id: str) -> bool:
    try:
        result = client.check(member_id)
    except TimeoutError:
        return False                                   # treat a timeout as "unknown → not covered"
    return result["status"] == "active"


def send_reminder(member_id: str) -> str:
    return notify(member_id, "Your coverage renews soon")


def notify(member_id: str, message: str) -> str:
    raise RuntimeError("real SMS gateway")


# --- tests ---
def test_active_member_is_covered():
    client = create_autospec(PayerClient, instance=True)       # mock with the real class's signature
    client.check.return_value = {"status": "active"}
    assert is_covered(client, "M1") is True
    client.check.assert_called_once_with("M1")


def test_timeout_means_not_covered():
    client = create_autospec(PayerClient, instance=True)
    client.check.side_effect = TimeoutError                    # side_effect raises
    assert is_covered(client, "M1") is False


def test_side_effect_sequence():
    m = MagicMock(side_effect=[{"status": "inactive"}, {"status": "active"}])   # one value per call
    assert m()["status"] == "inactive" and m()["status"] == "active"


def test_autospec_catches_wrong_calls():
    client = create_autospec(PayerClient, instance=True)
    with pytest.raises(TypeError):
        client.check("M1", "extra-argument")                  # a plain MagicMock would accept this silently


def test_patch_where_it_is_looked_up():
    # send_reminder looks up `notify` in its own module, so that is where we patch.
    # In a real project this is a dotted string: patch("app.reminders.notify", return_value="queued").
    this_module = sys.modules[__name__]
    with patch.object(this_module, "notify", return_value="queued") as fake_notify:
        assert send_reminder("M7") == "queued"
    fake_notify.assert_called_once_with("M7", "Your coverage renews soon")


if __name__ == "__main__":
    assert pytest.main([__file__, "-q", "-p", "no:cacheprovider"]) == 0
```

The rule people get wrong: **patch where the name is looked up, not where it is defined.** If `app/service.py` does
`from app.email import send`, patch `app.service.send`, because that is the name `service` uses.

Do not over-mock: mocking everything couples tests to implementation details. Prefer passing dependencies in (so a
fake can be passed), mock at the system's edges, and wrap third-party clients in a small class of your own so you
mock your interface rather than theirs.

For HTTP calls made with `httpx`, there is a built-in way to fake the server without patching anything:

```python
import httpx
import pytest


def fetch_member(client: httpx.Client, member_id: str) -> dict:
    r = client.get(f"/members/{member_id}")
    r.raise_for_status()
    return r.json()


def test_fetch_member_with_mock_transport():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/members/M1":
            return httpx.Response(200, json={"id": "M1", "plan": "HMO"})
        return httpx.Response(404)

    client = httpx.Client(base_url="https://payer.test", transport=httpx.MockTransport(handler))
    assert fetch_member(client, "M1") == {"id": "M1", "plan": "HMO"}
    with pytest.raises(httpx.HTTPStatusError):
        fetch_member(client, "M404")


if __name__ == "__main__":
    assert pytest.main([__file__, "-q", "-p", "no:cacheprovider"]) == 0
```

## Testing FastAPI

Make the app and the client fixtures, override dependencies with fakes, and clear the overrides in teardown so
tests stay independent.

```python
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient


# --- application code ---
class PatientRepo:
    def get(self, patient_id: int) -> dict | None:
        raise RuntimeError("real database")


def get_repo() -> PatientRepo:
    return PatientRepo()


def get_current_user() -> str:
    raise HTTPException(401, "Not authenticated")


app = FastAPI()


@app.get("/patients/{patient_id}")
def read_patient(patient_id: int,
                 repo: Annotated[PatientRepo, Depends(get_repo)],
                 user: Annotated[str, Depends(get_current_user)]):
    patient = repo.get(patient_id)
    if patient is None:
        raise HTTPException(404, "Patient not found")
    return patient


# --- tests ---
class FakeRepo(PatientRepo):
    def __init__(self) -> None:
        self.rows = {1: {"id": 1, "name": "Ana"}}

    def get(self, patient_id: int) -> dict | None:
        return self.rows.get(patient_id)


@pytest.fixture
def client():
    app.dependency_overrides[get_repo] = FakeRepo
    app.dependency_overrides[get_current_user] = lambda: "test-user"
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()          # never leak overrides into other tests


def test_read_patient(client):
    r = client.get("/patients/1")
    assert r.status_code == 200 and r.json() == {"id": 1, "name": "Ana"}


def test_missing_patient_is_404(client):
    assert client.get("/patients/99").status_code == 404


def test_bad_id_is_422(client):
    assert client.get("/patients/abc").status_code == 422


def test_requires_authentication():
    app.dependency_overrides[get_repo] = FakeRepo       # real auth this time
    try:
        assert TestClient(app).get("/patients/1").status_code == 401
    finally:
        app.dependency_overrides.clear()


if __name__ == "__main__":
    assert pytest.main([__file__, "-q", "-p", "no:cacheprovider"]) == 0
```

For integration tests against a real database, the common patterns are: a SQLite or PostgreSQL test database created
by a session-scoped fixture, each test wrapped in a transaction that is rolled back at the end, or a throwaway
PostgreSQL container started with Testcontainers.

## Testing async code

pytest itself does not run coroutines. Options: call `asyncio.run(...)` inside a normal test, use the AnyIO plugin
that ships with AnyIO (a FastAPI dependency) with `@pytest.mark.anyio`, or install `pytest-asyncio` and use
`@pytest.mark.asyncio`.

```python
import asyncio

import pytest


async def fetch_all(ids: list[str]) -> list[str]:
    async def one(i: str) -> str:
        await asyncio.sleep(0.01)
        return i.upper()
    return await asyncio.gather(*(one(i) for i in ids))


def test_with_asyncio_run():
    assert asyncio.run(fetch_all(["a", "b"])) == ["A", "B"]


@pytest.mark.anyio
async def test_with_anyio_plugin():
    assert await fetch_all(["c"]) == ["C"]


if __name__ == "__main__":
    assert pytest.main([__file__, "-q", "-p", "no:cacheprovider"]) == 0
```

## Coverage, TDD and CI

- **Coverage:** `pytest --cov=app --cov-report=term-missing` (the `pytest-cov` plugin) shows which lines never ran;
  add `--cov-branch` for branches and `--cov-fail-under=80` to fail CI below a threshold. Coverage shows what is
  **untested**, not that tested code is correct: 100% coverage with weak asserts proves little.
- **TDD:** red (write a failing test), green (simplest code that passes), refactor (clean up with the tests as a safety
  net). Especially valuable for bug fixes: reproduce the bug in a test first, then fix it.
- **CI:** run lint, type check and tests on every pull request (GitHub Actions), keep the unit suite under a few
  minutes, run slower integration tests in a separate job, and block merges on failures.

## Interview questions

### Why pytest rather than unittest? {core}

pytest needs less boilerplate: plain functions and plain `assert` statements, with detailed failure output showing the
values. Fixtures are more flexible than `setUp`/`tearDown`: they compose, have scopes and are shared through
`conftest.py`. Parametrisation, marks and a big plugin ecosystem (pytest-cov, pytest-xdist for parallel runs,
pytest-asyncio) come built in or one install away. It also runs existing `unittest` tests, so migration is gradual.

### What is a fixture, and how do fixture scopes work? {core}

A fixture is a function that provides something a test needs, requested by naming it as a test parameter. With
`yield`, the code after it is the teardown and runs even when the test fails. Scope controls reuse: `function` (the
default) gives every test a fresh instance, while `module` or `session` share an expensive resource, such as a
database engine or a loaded model, across many tests. Share scope wisely: shared mutable state is the main cause of
tests that pass alone and fail together.

### What is conftest.py?

A file pytest loads automatically for all tests in its directory and subdirectories. It holds shared fixtures (the
app, the test client, a database session), hooks and plugin configuration, with no imports needed in the test files.
You can have one at the root and more specific ones in subfolders.

### How do you test many input cases without copy-paste? {core}

`@pytest.mark.parametrize("raw, expected", [...])` runs one test body over a list of cases, and each case is reported
as its own test with a readable id. I list the normal cases, the boundaries and the error cases, and for errors I use
a separate parametrised test with `pytest.raises`.

### What is the difference between a mock, a stub and a fake? {core}

A stub returns canned answers. A mock does that and also records how it was called, so the test can assert "called
once with M1". A fake is a real but lightweight implementation, such as an in-memory repository or SQLite instead of
PostgreSQL. I prefer fakes for things like repositories, because tests then check behaviour rather than call
sequences, and mocks for edges such as an SMS gateway where the interaction itself is what matters.

### Where do you apply `patch`? {core}

Where the name is looked up, not where it is defined. If `orders.py` does `from email_client import send`, the code
calls `orders.send`, so I patch `"orders.send"`. Patching `"email_client.send"` would not affect the already-imported
name. Even better is to avoid patching by passing the dependency in, so the test can hand over a fake directly.

### What is the difference between `return_value` and `side_effect`? {deep}

`return_value` is what every call returns. `side_effect` is more powerful: an exception class or instance to raise
(simulate a timeout), an iterable to return different values on successive calls (fail twice, then succeed: perfect
for testing retries), or a function to compute the result from the arguments. If both are set, `side_effect` wins
unless the function returns `mock.DEFAULT`.

### What is autospec, and why use it? {deep}

A plain `MagicMock` accepts any attribute and any arguments, so a test can pass even when the code calls a method that
no longer exists or passes the wrong arguments. `create_autospec(RealClass)` or `patch(..., autospec=True)` builds a
mock with the real signature, so wrong calls raise `TypeError` and renamed methods break the test, as they should.

### How do you test an endpoint that uses a database or an external API? {core}

For unit-level API tests: `TestClient` with `app.dependency_overrides` replacing the repository or the API client
with a fake, plus a fixture that clears the overrides afterwards. For external HTTP, `httpx.MockTransport` (or a tool
like `respx`) fakes the server without patching. For integration tests, a real test database: a session-scoped engine
and a rollback per test, or a disposable PostgreSQL container via Testcontainers, so SQL and migrations are really
exercised.

### How do you test async code?

pytest does not run coroutines by itself. In a sync test I can call `asyncio.run(coro())`. More commonly I mark async
tests with `@pytest.mark.anyio` (the AnyIO plugin, already installed with FastAPI) or `@pytest.mark.asyncio` with
pytest-asyncio. For async HTTP endpoints I can also use `httpx.AsyncClient` with `ASGITransport(app=app)`.

### Explain the test pyramid. {core}

Many fast unit tests at the bottom, fewer integration tests in the middle, and a handful of end-to-end tests at the
top. Unit tests pinpoint failures and run in milliseconds; integration tests prove the pieces fit (SQL, serialisation,
configuration); end-to-end tests prove critical user journeys but are slow and flakier. Inverting the pyramid, with
mostly UI tests, gives slow, brittle suites.

**Your angle:** at Medidata, Cypress and Cucumber covered user journeys on top of lower-level tests.

### Do you practise TDD? {core}

Answer honestly and concretely. For example: "For bug fixes always: I write a failing test that reproduces the bug,
then fix it, so it can never come back. For new logic with clear rules, such as validation or eligibility
calculations, I often write tests first. For exploratory or UI work I write tests alongside the code." The red →
green → refactor loop keeps the design simple and gives a safety net for refactoring.

### What coverage do you aim for, and is 100% the goal?

Coverage shows what never ran, so it is good for finding untested code, but it does not prove correctness: a test
with no meaningful assert still counts. I aim for high coverage on business logic and critical paths (often 80% or
more, enforced in CI with `--cov-fail-under`), use branch coverage, and care more about testing edge cases and
failure paths than about the number.

### How do you test code that depends on the current time or randomness? {deep}

Make it injectable: pass a clock function or a `now` parameter, or a seeded `random.Random` instance, so tests
control the value. If the code calls `datetime.now()` directly, `monkeypatch` can replace the module's clock, or
libraries like `freezegun` and `time-machine` freeze time. For ML code, fix seeds (`random_state=42`) so results are
reproducible.

### How do you deal with flaky tests? {deep}

Treat them as bugs, because they train people to ignore failures. Common causes: shared state between tests, test
order dependence, real time and sleeps, real network calls, unseeded randomness, and race conditions. Fixes: fresh
fixtures, fakes for the network, injected clocks, polling with timeouts instead of fixed sleeps. Quarantine a flaky
test with a tracked ticket rather than retrying it forever.

### How do you test ML and data pipelines? {core}

At several levels. Unit tests for transformations: feature functions, cleaning and encoding on small hand-made
DataFrames with known outputs. Schema tests that data matches expectations (types, ranges, no unexpected nulls), with
Pydantic, Pandera or Great Expectations. Training smoke tests: the pipeline runs end to end on a tiny dataset and the
model beats a trivial baseline. Evaluation gates: a new model must meet minimum metrics on a fixed test set before
deployment. Fix random seeds everywhere.

### How do you test exceptions and log output? {deep}

`with pytest.raises(ValueError, match="unknown visit type"):` checks both the type and the message. The `caplog`
fixture captures log records, so I can assert a warning was logged, for example that a rejected document was logged
with its ID but **without** PHI. `capsys` captures printed output.

### What would you test end to end in a React + FastAPI application? {deep}

Only the critical journeys: log in, search for a patient, submit a form and see the result, plus one or two failure
paths. Playwright or Cypress drive a real browser against a deployed test environment with seeded data. Everything
else (component logic, API validation, business rules) is cheaper to test at the unit and integration levels.

## Coding problems

### Test a business rule thoroughly with parametrisation {easy core}

Write tests for `member_cost(allowed, deductible_remaining, coinsurance)`: the member pays the allowed amount up to the
remaining deductible, then a coinsurance share (0–1) of the rest. Invalid inputs (negative amounts, coinsurance
outside 0–1) raise `ValueError`. Cover normal cases, boundaries and errors in as few test functions as possible.

#### Hints

1. List the interesting cases first: deductible not met, exactly met, already met, zero allowed amount.
2. Use one parametrised test for valid cases and one for invalid ones.
3. Money and floats: compare with `pytest.approx`.

#### Solution

Write the function, then two parametrised tests: one for valid inputs with `ids` that read like documentation, one
for invalid inputs. Boundaries (exactly at the deductible, coinsurance of 0 and 1) are where bugs hide.

```python
import pytest


def member_cost(allowed: float, deductible_remaining: float, coinsurance: float) -> float:
    if allowed < 0 or deductible_remaining < 0:
        raise ValueError("amounts must not be negative")
    if not 0 <= coinsurance <= 1:
        raise ValueError("coinsurance must be between 0 and 1")
    toward_deductible = min(allowed, deductible_remaining)
    return toward_deductible + (allowed - toward_deductible) * coinsurance


@pytest.mark.parametrize(
    ("allowed", "deductible", "coins", "expected"),
    [
        (100, 500, 0.2, 100),       # all of it goes to the deductible
        (500, 500, 0.2, 500),       # exactly meets the deductible
        (1000, 500, 0.2, 600),      # 500 deductible + 20% of 500
        (1000, 0, 0.2, 200),        # deductible already met
        (0, 500, 0.2, 0),           # nothing allowed
        (300, 0, 0.0, 0),           # full coverage after deductible
        (300, 0, 1.0, 300),         # no coverage after deductible
        (99.99, 0, 0.1, 9.999),
    ],
    ids=["under", "exact", "over", "met", "zero", "coins-0", "coins-1", "cents"],
)
def test_member_cost(allowed, deductible, coins, expected):
    assert member_cost(allowed, deductible, coins) == pytest.approx(expected)


@pytest.mark.parametrize(
    ("allowed", "deductible", "coins"),
    [(-1, 0, 0.2), (100, -5, 0.2), (100, 0, -0.1), (100, 0, 1.5)],
)
def test_invalid_inputs(allowed, deductible, coins):
    with pytest.raises(ValueError):
        member_cost(allowed, deductible, coins)


if __name__ == "__main__":
    assert pytest.main([__file__, "-q", "-p", "no:cacheprovider"]) == 0
```

#### Follow-ups

- **Would you use floats for money in production?** No: `Decimal` or integer cents, to avoid rounding errors.
- **What else would you test?** Property-style checks: the member never pays more than the allowed amount, and the
  cost never decreases when the allowed amount increases (the `hypothesis` library automates this).

### Test retry logic around a flaky external call {medium core}

`get_eligibility(client, member_id, retries=3)` calls `client.check(member_id)`; on `TimeoutError` it retries up to
`retries` attempts in total, sleeping `0.1 * 2**attempt` seconds between attempts via an injected `sleep` function,
then re-raises. Write the function and tests proving: success on the first try, success after two timeouts (with the
right sleeps), and giving up after three attempts. The tests must not actually sleep.

#### Hints

1. `side_effect=[TimeoutError, TimeoutError, {"status": "active"}]` makes a mock fail twice, then succeed.
2. Inject `sleep` as a parameter and pass a mock, then assert on `sleep.call_args_list`.
3. `mock.call_count` tells you how many attempts were made.

#### Solution

Inject both collaborators (client and sleep), so the test controls failures and time without patching. Assert on
results, attempt counts and the exact backoff sequence.

```python
from unittest.mock import Mock, call

import pytest


def get_eligibility(client, member_id: str, retries: int = 3, sleep=None) -> dict:
    import time
    sleep = sleep or time.sleep
    for attempt in range(retries):
        try:
            return client.check(member_id)
        except TimeoutError:
            if attempt == retries - 1:
                raise                                  # out of attempts: let the caller decide
            sleep(0.1 * 2 ** attempt)                   # exponential backoff: 0.1, 0.2, 0.4 …
    raise AssertionError("unreachable")


def test_success_first_try():
    client, sleep = Mock(), Mock()
    client.check.return_value = {"status": "active"}
    assert get_eligibility(client, "M1", sleep=sleep) == {"status": "active"}
    client.check.assert_called_once_with("M1")
    sleep.assert_not_called()


def test_recovers_after_two_timeouts():
    client, sleep = Mock(), Mock()
    client.check.side_effect = [TimeoutError, TimeoutError, {"status": "active"}]
    assert get_eligibility(client, "M1", sleep=sleep) == {"status": "active"}
    assert client.check.call_count == 3
    assert sleep.call_args_list == [call(0.1), call(0.2)]


def test_gives_up_after_all_attempts():
    client, sleep = Mock(), Mock()
    client.check.side_effect = TimeoutError("payer API timed out")
    with pytest.raises(TimeoutError, match="timed out"):
        get_eligibility(client, "M1", retries=3, sleep=sleep)
    assert client.check.call_count == 3
    assert sleep.call_count == 2                       # no sleep after the final failure


def test_other_errors_are_not_retried():
    client, sleep = Mock(), Mock()
    client.check.side_effect = ValueError("bad member id")
    with pytest.raises(ValueError):
        get_eligibility(client, "??", sleep=sleep)
    assert client.check.call_count == 1


if __name__ == "__main__":
    assert pytest.main([__file__, "-q", "-p", "no:cacheprovider"]) == 0
```

#### Follow-ups

- **Why only retry timeouts?** Retrying a validation error can never succeed; only transient failures (timeouts,
  503, connection resets) should be retried, and only for idempotent calls.
- **What would you add in production?** Jitter on the backoff so many clients do not retry in lockstep, and a cap on
  the total wait.

### Test a FastAPI endpoint with fixtures and overrides {medium core}

Given an endpoint `POST /claims` that validates the body, stores the claim through a repository dependency and
returns 201 with the stored claim, write a pytest suite with a `client` fixture and an in-memory repository fake.
Test the happy path, a validation failure and a duplicate claim ID (409), and assert that the fake received exactly
one stored claim.

#### Hints

1. A fixture creates a fresh fake repository; a second fixture overrides the dependency and yields the client.
2. Clear `app.dependency_overrides` after the `yield`.
3. Tests can request both fixtures to inspect the fake after the call.

#### Solution

Two fixtures: `repo` (fresh fake per test) and `client` (depends on `repo`, installs the override, cleans up). Tests
request both, so they can check the HTTP response and what was stored.

```python
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field


class ClaimIn(BaseModel):
    claim_id: str = Field(pattern=r"^C\d+$")
    member_id: str
    amount: float = Field(gt=0)


class ClaimRepo:
    def exists(self, claim_id: str) -> bool: raise NotImplementedError
    def save(self, claim: ClaimIn) -> None: raise NotImplementedError


def get_repo() -> ClaimRepo:
    raise RuntimeError("configure a real repository in production")


app = FastAPI()


@app.post("/claims", status_code=201)
def submit_claim(claim: ClaimIn, repo: Annotated[ClaimRepo, Depends(get_repo)]) -> ClaimIn:
    if repo.exists(claim.claim_id):
        raise HTTPException(409, f"Claim {claim.claim_id} already exists")
    repo.save(claim)
    return claim


class FakeClaimRepo(ClaimRepo):
    def __init__(self) -> None:
        self.saved: dict[str, ClaimIn] = {}

    def exists(self, claim_id: str) -> bool:
        return claim_id in self.saved

    def save(self, claim: ClaimIn) -> None:
        self.saved[claim.claim_id] = claim


@pytest.fixture
def repo() -> FakeClaimRepo:
    return FakeClaimRepo()


@pytest.fixture
def client(repo):
    app.dependency_overrides[get_repo] = lambda: repo
    yield TestClient(app)
    app.dependency_overrides.clear()


VALID = {"claim_id": "C100", "member_id": "M1", "amount": 250.0}


def test_submit_claim(client, repo):
    r = client.post("/claims", json=VALID)
    assert r.status_code == 201 and r.json() == VALID
    assert list(repo.saved) == ["C100"]


@pytest.mark.parametrize("bad", [{**VALID, "amount": 0}, {**VALID, "claim_id": "X1"}, {"member_id": "M1"}])
def test_invalid_body_is_rejected_and_not_saved(client, repo, bad):
    assert client.post("/claims", json=bad).status_code == 422
    assert repo.saved == {}


def test_duplicate_claim_is_409(client, repo):
    assert client.post("/claims", json=VALID).status_code == 201
    r = client.post("/claims", json=VALID)
    assert r.status_code == 409 and "already exists" in r.json()["detail"]
    assert len(repo.saved) == 1


if __name__ == "__main__":
    assert pytest.main([__file__, "-q", "-p", "no:cacheprovider"]) == 0
```

#### Follow-ups

- **Where would these fixtures live in a real project?** In `tests/conftest.py`, shared by every API test file.
- **What does this not test?** The real repository's SQL. Add integration tests for it against a real database.

### Make time-dependent code testable {medium}

`is_appointment_reminder_due(appointment_start)` should return `True` when the appointment starts within the next 24
hours. The first version calls `datetime.now()` inside, which makes it untestable. Refactor it so tests control time,
and write tests for: 23 hours away (due), 25 hours away (not due), already started (not due), and exactly 24 hours
away (due).

#### Hints

1. Add a `now` parameter with a default, or pass in a clock function.
2. Use timezone-aware datetimes (UTC) so daylight-saving changes cannot break the logic.
3. Exactly-24-hours is a boundary: decide whether it is inclusive and test it.

#### Solution

Inject the clock as a parameter that defaults to the real one. Production callers change nothing; tests pass a fixed
instant. Use aware UTC datetimes.

```python
from datetime import UTC, datetime, timedelta
from typing import Callable

import pytest


def utc_now() -> datetime:
    return datetime.now(UTC)


def is_reminder_due(start: datetime, now: Callable[[], datetime] = utc_now) -> bool:
    remaining = start - now()
    return timedelta(0) < remaining <= timedelta(hours=24)


FIXED = datetime(2026, 10, 13, 9, 0, tzinfo=UTC)
clock = lambda: FIXED


@pytest.mark.parametrize(
    ("hours_away", "due"),
    [(23, True), (25, False), (-1, False), (24, True), (0, False)],
    ids=["23h", "25h", "started", "exactly-24h", "starting-now"],
)
def test_reminder_due(hours_away, due):
    assert is_reminder_due(FIXED + timedelta(hours=hours_away), now=clock) is due


def test_default_clock_is_real_time():
    assert is_reminder_due(utc_now() + timedelta(hours=2)) is True


if __name__ == "__main__":
    assert pytest.main([__file__, "-q", "-p", "no:cacheprovider"]) == 0
```

#### Follow-ups

- **What if you cannot change the signature?** Use `monkeypatch.setattr(module, "utc_now", lambda: FIXED)` or a
  library like `freezegun` or `time-machine`.
- **Why aware datetimes?** Naive datetimes have no timezone, so comparing a server's local time with UTC data, or
  crossing a daylight-saving change, silently shifts results by hours.
