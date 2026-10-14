---
title: Type hints and Pydantic
goal: Explain what Python type hints do and do not do, write precise hints for real code, and use Pydantic 2 to validate untrusted data, including model output from an AI system.
minutes: 50
---

Type hints are how modern Python teams keep large codebases safe, and Pydantic turns those hints into runtime
validation. Both matter in this role: FastAPI is built on Pydantic, and "build, train, evaluate and deploy ML models"
means data contracts between pipeline stages.

This is also one of your strongest stories. At Quantiphi you designed **schema-based structured output validation with
Pydantic** as the quality gate on ML-extracted Medicaid document fields before human review. Expect to be asked about
it, and use the problems at the end of this chapter to rehearse it with code.

## Type hints in one page

Python is dynamically typed: hints are **not enforced at runtime**. A static checker (mypy, pyright, or your IDE)
reads them and reports mistakes before the code runs, and libraries such as Pydantic and FastAPI read them at runtime
to drive validation.

```python
from collections.abc import Callable, Iterable, Mapping, Sequence
from typing import Any, Literal, TypedDict


def average(values: Sequence[float]) -> float:          # accepts a list, a tuple, …
    return sum(values) / len(values)


def find_member(member_id: str, members: Mapping[str, dict]) -> dict | None:   # may return None
    return members.get(member_id)


Status = Literal["submitted", "paid", "denied"]           # only these three strings


class ClaimRow(TypedDict):                                # the shape of a plain dict
    id: int
    status: Status
    amount: float


def apply_all(rows: Iterable[ClaimRow], fn: Callable[[ClaimRow], float]) -> list[float]:
    return [fn(r) for r in rows]


rows: list[ClaimRow] = [{"id": 1, "status": "paid", "amount": 120.0}]
assert apply_all(rows, lambda r: r["amount"] * 2) == [240.0]
assert average((1, 2, 3)) == 2.0
assert find_member("M9", {}) is None


def not_enforced(x: int) -> int:
    return x


assert not_enforced("hello") == "hello"     # hints do nothing at runtime: no error here
print("hints ok")
```

| Hint | Meaning |
|---|---|
| `int \| None` (older: `Optional[int]`) | An `int` or `None`. "Optional" means *nullable*, not "the argument can be omitted". |
| `list[str]`, `dict[str, int]`, `tuple[int, str]`, `tuple[int, ...]` | Built-in generics (Python 3.9+, no `typing.List` needed) |
| `Sequence`, `Mapping`, `Iterable` (from `collections.abc`) | Read-only "anything list-like / dict-like": the best type for **parameters** |
| `Literal["a", "b"]` | Exactly these values |
| `Callable[[int, str], bool]` | A function taking `(int, str)` and returning `bool` |
| `Any` | Opt out of checking. `object` is the safe "could be anything, so check before use" |
| `TypedDict` | The shape of a dict with fixed keys (JSON) |
| `Protocol` | "Anything with these methods": structural typing |
| `Annotated[int, Field(gt=0)]` | A type plus metadata that libraries (Pydantic, FastAPI) read |
| `Self`, `override`, `TypeIs` | Newer helpers (3.11, 3.12, 3.13) for fluent methods, overrides and narrowing |

Rule of thumb: accept general types (`Iterable`, `Mapping`), return specific ones (`list`, `dict`).

## Generics and Protocols

Generics let one function or class work for any type while keeping the relationship between types. Python 3.12 added
a compact syntax (PEP 695); the older `TypeVar` form still works and you will see it in most codebases.

```python
from collections import defaultdict
from collections.abc import Callable, Iterable
from typing import Protocol, TypeVar

# Python 3.12+ syntax: type parameters in square brackets.
def first[T](items: list[T]) -> T:
    return items[0]


def group_by[T, K](items: Iterable[T], key: Callable[[T], K]) -> dict[K, list[T]]:
    groups: dict[K, list[T]] = defaultdict(list)
    for item in items:
        groups[key(item)].append(item)
    return dict(groups)


type Pair[T] = tuple[T, T]         # a generic type alias (3.12+)

# The older, still very common form.
T = TypeVar("T")

def last(items: list[T]) -> T:
    return items[-1]


class Stack[T]:
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()


# Protocol: structural typing. Anything with a matching .send() fits; no inheritance needed.
class Notifier(Protocol):
    def send(self, to: str, message: str) -> bool: ...


class EmailNotifier:                      # does not inherit from Notifier
    def __init__(self) -> None:
        self.sent: list[str] = []

    def send(self, to: str, message: str) -> bool:
        self.sent.append(f"{to}: {message}")
        return True


def remind(n: Notifier, patient_email: str) -> bool:
    return n.send(patient_email, "Your appointment is tomorrow")


assert first([3, 1]) == 3 and last(["a", "b"]) == "b"
assert group_by(["apple", "avocado", "banana"], key=lambda s: s[0]) == {"a": ["apple", "avocado"], "b": ["banana"]}
s: Stack[int] = Stack()
s.push(1)
assert s.pop() == 1
pair: Pair[int] = (1, 2)
email = EmailNotifier()
assert remind(email, "ana@example.com") and email.sent == ["ana@example.com: Your appointment is tomorrow"]
print("generics and protocols ok")
```

**Protocol or ABC?** An abstract base class is *nominal*: a class must inherit from it. A Protocol is *structural*:
any class with the right methods matches, which suits code you do not own and fakes in tests.

## Pydantic 2: validation from type hints

Pydantic reads a class's type hints and **validates and converts** input data at runtime. Its core is written in Rust
(`pydantic-core`), which made version 2 several times faster than version 1.

```python
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, ValidationError


class Address(BaseModel):
    state: str = Field(pattern=r"^[A-Z]{2}$")
    zip_code: str = Field(pattern=r"^\d{5}$")


class Patient(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    member_id: str = Field(min_length=3)
    name: str
    birth_date: date
    household_size: int = Field(ge=1, le=20)
    address: Address                          # nested model
    phones: list[str] = []                    # mutable defaults are copied per instance in Pydantic


p = Patient.model_validate({
    "member_id": " M123 ", "name": "Ana Diaz", "birth_date": "1980-02-29",
    "household_size": "4",                    # lax mode: the string "4" becomes the int 4
    "address": {"state": "LA", "zip_code": "70112"},
})
assert p.member_id == "M123" and p.household_size == 4 and p.birth_date == date(1980, 2, 29)

# Serialise back out.
assert p.model_dump(mode="json")["birth_date"] == "1980-02-29"
assert p.model_dump(include={"name"}) == {"name": "Ana Diaz"}
assert Patient.model_validate_json(p.model_dump_json()) == p     # JSON round trip

# Every problem is reported at once, each with a location.
try:
    Patient.model_validate({"member_id": "M1", "name": "X", "birth_date": "1980-13-01",
                            "household_size": 0, "address": {"state": "Louisiana", "zip_code": "7011"},
                            "ssn": "123-45-6789"})
except ValidationError as e:
    problems = {(".".join(map(str, err["loc"])), err["type"]) for err in e.errors()}
    assert problems == {
        ("member_id", "string_too_short"),
        ("birth_date", "date_from_datetime_parsing"),
        ("household_size", "greater_than_equal"),
        ("address.state", "string_pattern_mismatch"),
        ("address.zip_code", "string_pattern_mismatch"),
        ("ssn", "extra_forbidden"),
    }, problems
print("pydantic basics ok")
```

The Pydantic 2 API you should know by heart:

| Task | Pydantic 2 | (Pydantic 1 name you may see in old code) |
|---|---|---|
| Validate a dict | `Model.model_validate(data)` | `parse_obj` |
| Validate a JSON string | `Model.model_validate_json(text)` | `parse_raw` |
| To a dict | `m.model_dump()` (`mode="json"` for JSON-safe types) | `dict()` |
| To JSON | `m.model_dump_json()` | `json()` |
| Copy with changes | `m.model_copy(update={...})` | `copy()` |
| JSON Schema | `Model.model_json_schema()` | `schema()` |
| Config | `model_config = ConfigDict(...)` | inner `class Config` |
| Validators | `@field_validator`, `@model_validator` | `@validator`, `@root_validator` |
| Non-model types | `TypeAdapter(list[int]).validate_python(...)` | `parse_obj_as` |

## Validators, strict mode and aliases

```python
from datetime import date
from typing import Annotated

from pydantic import (AfterValidator, BaseModel, ConfigDict, Field, ValidationError,
                      computed_field, field_validator, model_validator)
from pydantic.alias_generators import to_camel


def not_in_future(d: date) -> date:
    if d > date(2026, 10, 13):
        raise ValueError("date cannot be in the future")
    return d


PastDate = Annotated[date, AfterValidator(not_in_future)]      # a reusable constrained type


class Coverage(BaseModel):
    # JSON uses camelCase, Python uses snake_case.
    model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True, validate_by_alias=True)

    member_name: str
    plan_code: str
    start_date: PastDate
    end_date: date

    @field_validator("member_name", mode="before")      # runs before type validation: clean raw input
    @classmethod
    def tidy(cls, v: object) -> object:
        return " ".join(v.split()) if isinstance(v, str) else v

    @field_validator("plan_code")                         # runs after: v is already a str
    @classmethod
    def upper(cls, v: str) -> str:
        return v.upper()

    @model_validator(mode="after")                        # cross-field rule: sees the whole model
    def check_dates(self) -> "Coverage":
        if self.end_date < self.start_date:
            raise ValueError("endDate must be on or after startDate")
        return self

    @computed_field                                       # included in model_dump / JSON output
    @property
    def days(self) -> int:
        return (self.end_date - self.start_date).days


c = Coverage.model_validate({"memberName": "  Ana   Diaz ", "planCode": "hmo-1",
                             "startDate": "2026-01-01", "endDate": "2026-12-31"})
assert c.member_name == "Ana Diaz" and c.plan_code == "HMO-1" and c.days == 364
assert c.model_dump(by_alias=True, mode="json")["startDate"] == "2026-01-01"
assert Coverage(member_name="B", plan_code="x", start_date=date(2026, 1, 1), end_date=date(2026, 1, 2)).days == 1

try:
    Coverage.model_validate({"memberName": "A", "planCode": "p", "startDate": "2026-06-01", "endDate": "2026-01-01"})
except ValidationError as e:
    assert "endDate must be on or after startDate" in e.errors()[0]["msg"]

try:
    Coverage.model_validate({"memberName": "A", "planCode": "p", "startDate": "2030-01-01", "endDate": "2031-01-01"})
except ValidationError as e:
    assert e.errors()[0]["loc"] == ("startDate",)


class StrictCount(BaseModel):
    model_config = ConfigDict(strict=True)
    count: int


try:
    StrictCount(count="3")                  # strict: no str → int coercion
except ValidationError as e:
    assert e.errors()[0]["type"] == "int_type"
print("validators ok")
```

Things that catch people out:

- `mode="before"` validators get the **raw** input (could be anything); default (`"after"`) validators get the
  already-typed value.
- A `model_validator(mode="after")` does **not** run if any field failed validation, because the model could not be
  built. Users see the field errors first, then the cross-field error on the next attempt.
- **Lax mode** (the default) converts sensible inputs: `"4"` → `4`, `"2026-01-01"` → `date`. **Strict mode** turns
  that off, per model (`ConfigDict(strict=True)`), per field (`Field(strict=True)`) or per call (`strict=True`).
  When parsing JSON, strict mode still accepts an ISO date string for a `date`, because JSON has no date type.
- Validators raise `ValueError` (or `AssertionError`); Pydantic collects them into one `ValidationError`.

## Discriminated unions

When a payload can be one of several shapes, a `Literal` tag field lets Pydantic pick the right model directly.
With a plain union, Pydantic's default "smart" mode validates the input against every member and keeps the best
match, and a failure lists errors for every member. With a discriminator it validates against exactly one model, and
the errors name that model.

```python
from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter, ValidationError


class MagiApplication(BaseModel):
    doc_type: Literal["magi"]
    household_size: int
    annual_income: float


class Paystub(BaseModel):
    doc_type: Literal["paystub"]
    employer: str
    gross_pay: float


Document = Annotated[MagiApplication | Paystub, Field(discriminator="doc_type")]
documents = TypeAdapter(list[Document])

docs = documents.validate_python([
    {"doc_type": "paystub", "employer": "Acme", "gross_pay": "1520.50"},
    {"doc_type": "magi", "household_size": 3, "annual_income": 41000},
])
assert isinstance(docs[0], Paystub) and docs[0].gross_pay == 1520.5
assert isinstance(docs[1], MagiApplication)

try:
    documents.validate_python([{"doc_type": "paystub", "employer": "Acme"}])
except ValidationError as e:
    assert e.errors()[0]["loc"] == (0, "paystub", "gross_pay")      # names the right model

try:
    documents.validate_python([{"doc_type": "w2"}])
except ValidationError as e:
    assert e.errors()[0]["type"] == "union_tag_invalid"
print("discriminated union ok")
```

## dataclass, TypedDict or Pydantic?

| | `@dataclass` | `TypedDict` | Pydantic `BaseModel` |
|---|---|---|---|
| What it is | A plain class with generated `__init__`, `__repr__`, `__eq__` | A type for a dict's shape | A class that validates and converts |
| Runtime validation | None | None (it is just a dict) | Yes, with coercion and clear errors |
| Use it for | Internal data you create yourself | Typing existing JSON/dicts with no overhead | Untrusted input: API bodies, files, config, LLM output |
| Cost | Fastest | Free | Small validation cost |

Validate at the **boundaries** (HTTP requests, files, queues, model output) with Pydantic; inside the system, plain
dataclasses or models are both fine.

## Interview questions

### Are Python type hints enforced at runtime? {core}

No. The interpreter stores them but does not check them: passing a string to a parameter hinted `int` runs fine. They
are checked **statically** by tools like mypy or pyright, in the IDE and in CI, and some libraries read them at
runtime on purpose: Pydantic validates data against them and FastAPI uses them to parse requests. So hints give you
static safety everywhere, and runtime validation only where a library does it.

### What does `Optional[int]` mean? {core}

It means `int | None`: the value may be `None`. It does **not** mean the argument is optional; that comes from giving
it a default. `def f(x: int | None)` still requires `x`; `def f(x: int | None = None)` makes it optional. Since
Python 3.10 the `X | None` form is preferred.

### What is the difference between `Any` and `object`? {deep}

`Any` switches type checking off: you can do anything with it, and it is compatible with every type in both
directions, so errors slip through. `object` is the top type: anything can be passed in, but you cannot use it as a
specific type until you narrow it with `isinstance`. Prefer `object` (or a precise type) for "could be anything".

### Protocol or abstract base class? {core}

An ABC is nominal typing: implementations must inherit from it, and Python refuses to instantiate a subclass that
misses an abstract method. A Protocol is structural typing, static duck typing: any class with matching methods
satisfies it without inheriting. I use Protocols for dependencies such as "a notifier" or "a repository", so tests can
pass simple fakes and third-party classes fit; ABCs when I want shared base behaviour and a runtime check.

### How do you write a generic function? {deep}

With a type parameter, so the checker keeps the relationship between input and output: `def first[T](items:
list[T]) -> T` (Python 3.12 syntax), or with `T = TypeVar("T")` in older code. Then `first([1, 2])` is known to
return `int`. Bounds restrict the parameter: `def biggest[T: Comparable](...)` or `TypeVar("T", bound=...)`.

### How do you use mypy or pyright in a team? {deep}

Run it in CI and pre-commit so type errors fail the build, start lenient on legacy code and tighten module by module
(`strict` for new packages), and avoid `Any` and blanket `# type: ignore` (use a specific error code when you must).
Type the boundaries first: public functions, API schemas, data access. It catches `None` handling bugs, wrong
argument types and refactoring breakage early.

### What is Pydantic and why use it? {core}

Pydantic is a data validation library: you declare a model with type hints and constraints, and it parses untrusted
input into typed objects, converting sensible values and collecting every error with its location. It also serialises
back to dicts and JSON and generates JSON Schema. I use it at every boundary: API request and response bodies (FastAPI
is built on it), configuration, messages from queues and, importantly, LLM or ML output.

**Your angle:** on the LDH Medicaid Document AI platform, Pydantic schemas enforced the data contract on fields
extracted from MAGI and Non-MAGI forms and paystubs; records that failed went to human review instead of downstream.

### What changed between Pydantic 1 and 2? {core}

Version 2 rewrote the core in Rust (`pydantic-core`), so validation is much faster. The API was renamed: `parse_obj`
→ `model_validate`, `.dict()` → `model_dump()`, `.json()` → `model_dump_json()`, `class Config` → `model_config =
ConfigDict(...)`, `@validator` / `@root_validator` → `@field_validator` / `@model_validator`. It added strict mode,
`TypeAdapter` for validating any type, `computed_field`, better discriminated unions and more precise error types.
Migration is mostly mechanical; there is a `bump-pydantic` tool for it.

### What is lax mode versus strict mode? {core}

By default Pydantic is lax: it converts obviously-intended values, such as `"4"` to `4` or `"2026-01-01"` to a
`date`. Strict mode disables that, so the type must match exactly, which you want when silent coercion could hide a
bug, for example a numeric ID arriving as a float. You can make a whole model strict, a single field, or one call.

### When do you use a field validator versus a model validator? {core}

A `field_validator` checks or transforms one field: normalise whitespace, upper-case a code, reject a future date.
With `mode="before"` it sees the raw input; by default it sees the already-typed value. A `model_validator` handles
rules across fields, such as "end date is after start date" or "if status is denied, a reason code is required". An
after-mode model validator only runs when all fields are valid, so cross-field errors appear after field errors are
fixed.

### What does `extra="forbid"` do, and when do you use it? {core}

It makes unknown fields an error instead of silently ignoring them (the default is `"ignore"`; `"allow"` keeps them).
I use it on inbound APIs and especially on LLM output, where a misspelt key such as `birthdate` instead of
`birth_date` would otherwise be dropped silently and the value lost.

### How do you map camelCase JSON to snake_case Python fields? {deep}

With aliases: `Field(alias="birthDate")` for one field, or `ConfigDict(alias_generator=to_camel)` for all of them.
Allow both names on input with `validate_by_name=True` (older code uses `populate_by_name=True`), and output camelCase
with `model_dump(by_alias=True)`. FastAPI also uses aliases when it serialises responses.

### What is a discriminated union, and why is it better than a plain union? {deep}

A union where every member has a `Literal` tag field, declared with `Field(discriminator="doc_type")`. Pydantic reads
the tag and validates against exactly one model, instead of validating against every member and choosing the best
match (the default "smart" union mode). It is faster, it cannot pick the wrong model when shapes overlap, and errors
point at the right model ("paystub.gross_pay is missing") instead of listing failures for every member.

### How did you validate ML-extracted document fields? {core}

Walk through the pipeline: the extractor returns JSON per document; a Pydantic model per document type (with types,
patterns, ranges and cross-field rules) validates it. Valid records move on to submission; failures, together with
the exact field errors, are routed to the human-in-the-loop queue, where reviewers see which fields to check.
`extra="forbid"` and strict types catch silent drift in the extractor's output. The same schemas generate JSON Schema
for documentation and for constraining model output.

### How do you validate something that is not a model, such as `list[int]`? {deep}

With `TypeAdapter`: `TypeAdapter(list[int]).validate_python(data)` or `.validate_json(text)`. It works for any type:
lists of models, unions, `TypedDict`s, dataclasses. Create the adapter once and reuse it, because building it costs
more than using it.

### How do you load configuration safely? {deep}

With `pydantic-settings`: a `BaseSettings` subclass reads environment variables (and optionally a `.env` file),
validates and types them, and fails fast at startup if a required setting such as `DATABASE_URL` is missing. Secrets
use `SecretStr`, so they are masked in logs and reprs. In the cloud the values come from Secret Manager or Key Vault
injected as environment variables.

### Is a mutable default like `phones: list[str] = []` a bug in Pydantic? {deep}

Not in Pydantic: it copies mutable defaults for each instance, so instances do not share the list. It is a bug in a
plain function default and in a dataclass (which refuses it and makes you use `field(default_factory=list)`). Using
`Field(default_factory=list)` in Pydantic is also fine and makes the intent explicit.

### dataclass, TypedDict or Pydantic model: which do you choose? {core}

Pydantic for untrusted input at the boundaries, because it validates and converts. Dataclasses for internal data I
construct myself, where validation would be wasted work. `TypedDict` when the data must stay a dict (existing JSON,
kwargs) and I only want static checking. FastAPI accepts all three, but only Pydantic gives runtime guarantees.

### What changed about annotations in Python 3.14? {deep}

Annotations are now evaluated lazily (PEP 649 and PEP 749): they are stored and only computed when something asks for
them, so forward references to classes defined later work without quotes and without `from __future__ import
annotations`. Tools read them through the new `annotationlib` module. For everyday code the visible effect is fewer
quoted type names; libraries like Pydantic handle the details.

## Coding problems

### Validate a patient intake payload {medium core}

Write a Pydantic model for patient intake that:

- trims and collapses whitespace in `name`, and rejects blank names;
- requires `birth_date` not in the future (treat today as 2026-10-13) and the patient younger than 120;
- accepts an optional `npi` for the referring provider, which must be 10 digits with a valid check digit;
- rejects unknown fields.

Show that every error comes back at once with its field name.

#### Hints

1. `ConfigDict(extra="forbid")` handles unknown fields; `field_validator(..., mode="before")` can clean the raw name.
2. NPI check digit: Luhn algorithm over the prefix `80840` plus the first nine digits; the result must equal the tenth.
3. Collect errors with `ValidationError.errors()`: each has `loc`, `msg` and `type`.

#### Solution

Field validators handle each rule; a reusable `Annotated` type keeps the NPI logic in one place. The Luhn check:
starting from the rightmost digit of `80840` + first nine digits, double every other digit (starting with the
rightmost), subtract 9 from results above 9, sum, and the check digit is what brings the total to a multiple of 10.

```python
from datetime import date
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, ValidationError, field_validator

TODAY = date(2026, 10, 13)


def check_npi(npi: str) -> str:
    if len(npi) != 10 or not npi.isdigit():
        raise ValueError("NPI must be exactly 10 digits")
    total = 0
    for i, ch in enumerate(reversed("80840" + npi[:9])):
        d = int(ch)
        if i % 2 == 0:            # double every other digit, starting from the right
            d *= 2
            if d > 9:
                d -= 9
        total += d
    if (10 - total % 10) % 10 != int(npi[9]):
        raise ValueError("NPI check digit is invalid")
    return npi


NPI = Annotated[str, AfterValidator(check_npi)]


class Intake(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    birth_date: date
    referring_npi: NPI | None = None

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, v: object) -> object:
        return " ".join(v.split()) if isinstance(v, str) else v

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v:
            raise ValueError("name must not be blank")
        return v

    @field_validator("birth_date")
    @classmethod
    def plausible_birth_date(cls, v: date) -> date:
        if v > TODAY:
            raise ValueError("birth date is in the future")
        if TODAY.year - v.year > 120:
            raise ValueError("birth date is more than 120 years ago")
        return v


def errors_of(data: dict) -> dict[str, str]:
    try:
        Intake.model_validate(data)
    except ValidationError as e:
        return {".".join(map(str, err["loc"])): err["msg"] for err in e.errors()}
    return {}


ok = Intake.model_validate({"name": "  Ana   María Diaz ", "birth_date": "1980-02-29", "referring_npi": "1234567893"})
assert ok.name == "Ana María Diaz" and ok.referring_npi == "1234567893"
assert Intake(name="Bo", birth_date=date(2000, 1, 1)).referring_npi is None

assert errors_of({"name": "   ", "birth_date": "2027-01-01", "referring_npi": "1234567890", "ssn": "x"}) == {
    "name": "Value error, name must not be blank",
    "birth_date": "Value error, birth date is in the future",
    "referring_npi": "Value error, NPI check digit is invalid",
    "ssn": "Extra inputs are not permitted",
}
assert errors_of({"name": "Old", "birth_date": "1890-05-05"}) == {
    "birth_date": "Value error, birth date is more than 120 years ago"}
assert errors_of({"name": "X", "birth_date": "1990-01-01", "referring_npi": "12345"}) == {
    "referring_npi": "Value error, NPI must be exactly 10 digits"}
print("intake validation ok")
```

Each validation is O(length of the input).

#### Follow-ups

- **How would the front end use these errors?** Map `loc` to form fields and show `msg` next to each one; all errors
  arrive in one response.
- **Where does "today" come from in production?** Inject it (a clock dependency) so tests are deterministic, as here.

### Route extracted documents: auto-accept or human review {medium core}

An AI extractor returns a list of raw JSON strings, one per document, each meant to contain `member_id` (letter `M`
plus 6 digits), `gross_pay` (positive), `pay_period_end` (a date) and `confidence` (0–1). Write
`route(raw_docs, min_confidence)` that returns `(accepted, review)`: `accepted` holds validated models; `review` holds
`(index, reasons)` for every document that is not valid JSON, fails validation, or has confidence below the threshold.

#### Hints

1. `Model.model_validate_json(text)` parses and validates in one step; invalid JSON raises a `ValidationError` too.
2. Use `extra="forbid"` so a misspelt key is caught rather than silently ignored.
3. Confidence is a business rule, not a schema rule: check it after validation succeeds.

#### Solution

Validate each document independently, so one bad record never blocks the batch; turn errors into short readable
reasons; apply the confidence threshold to valid records only. This is the quality gate in front of human review.

```python
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, ValidationError


class Paystub(BaseModel):
    model_config = ConfigDict(extra="forbid")
    member_id: str = Field(pattern=r"^M\d{6}$")
    gross_pay: float = Field(gt=0)
    pay_period_end: date
    confidence: float = Field(ge=0, le=1)


def route(raw_docs: list[str], min_confidence: float) -> tuple[list[Paystub], list[tuple[int, list[str]]]]:
    accepted: list[Paystub] = []
    review: list[tuple[int, list[str]]] = []
    for i, raw in enumerate(raw_docs):
        try:
            doc = Paystub.model_validate_json(raw)
        except ValidationError as e:
            reasons = [f"{'.'.join(map(str, err['loc'])) or 'document'}: {err['msg']}" for err in e.errors()]
            review.append((i, reasons))
            continue
        if doc.confidence < min_confidence:
            review.append((i, [f"confidence {doc.confidence:.2f} below {min_confidence:.2f}"]))
        else:
            accepted.append(doc)
    return accepted, review


docs = [
    '{"member_id": "M123456", "gross_pay": 1520.5, "pay_period_end": "2026-09-30", "confidence": 0.97}',
    '{"member_id": "123456", "gross_pay": -10, "pay_period_end": "2026-09-30", "confidence": 0.99}',
    '{"member_id": "M654321", "gross_pay": 900, "pay_period_end": "2026-09-30", "confidence": 0.62}',
    '{"member_id": "M111111", "gross_pay": 900, "payPeriodEnd": "2026-09-30", "confidence": 0.99}',
    'Sure! Here is the JSON you asked for: {"member_id": ...',
]
accepted, review = route(docs, min_confidence=0.85)

assert [d.member_id for d in accepted] == ["M123456"]
assert [i for i, _ in review] == [1, 2, 3, 4]
assert review[0][1] == ["member_id: String should match pattern '^M\\d{6}$'",
                        "gross_pay: Input should be greater than 0"]
assert review[1][1] == ["confidence 0.62 below 0.85"]
assert sorted(review[2][1]) == ["payPeriodEnd: Extra inputs are not permitted", "pay_period_end: Field required"]
assert review[3][1][0].startswith("document: Invalid JSON")
print("routing ok")
```

O(total input size). Every rejected document carries its reasons, which is what reviewers need.

#### Follow-ups

- **How do you reduce how often the model produces invalid JSON?** Give it the JSON Schema
  (`Paystub.model_json_schema()`) through the provider's structured-output feature, and retry once with the
  validation errors in the prompt before routing to a human.
- **How do you monitor this in production?** Track the share of documents per error type and per field over time; a
  jump means the extractor or the document mix changed.

### Write a typed, generic `group_by` and prove it with a type-friendly test {easy}

Write `group_by(items, key)` that returns a dict from each key to the list of items with that key, preserving input
order inside each group. It must work for any item type and key type, and its signature should tell a type checker
that `group_by(claims, lambda c: c.status)` returns `dict[str, list[Claim]]`.

#### Hints

1. Two type parameters: one for the item, one for the key: `def group_by[T, K](...)`.
2. `key` is a `Callable[[T], K]`; accept any `Iterable[T]`.
3. `defaultdict(list)` makes the loop one line.

#### Solution

Two type parameters link the input and output types; `defaultdict(list)` collects the groups in input order.

```python
from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass


def group_by[T, K](items: Iterable[T], key: Callable[[T], K]) -> dict[K, list[T]]:
    groups: defaultdict[K, list[T]] = defaultdict(list)
    for item in items:
        groups[key(item)].append(item)
    return dict(groups)


@dataclass(frozen=True)
class Claim:
    id: int
    status: str
    amount: float


claims = [Claim(1, "paid", 100), Claim(2, "denied", 50), Claim(3, "paid", 75)]
by_status = group_by(claims, lambda c: c.status)          # a checker infers dict[str, list[Claim]]
assert by_status == {"paid": [claims[0], claims[2]], "denied": [claims[1]]}
assert {k: sum(c.amount for c in v) for k, v in by_status.items()} == {"paid": 175, "denied": 50}
assert group_by([], key=len) == {}
assert group_by(["a", "bb", "cc"], key=len) == {1: ["a"], 2: ["bb", "cc"]}
assert group_by(range(6), key=lambda n: n % 2 == 0) == {True: [0, 2, 4], False: [1, 3, 5]}
print("group_by ok")
```

O(n) time and space.

#### Follow-ups

- **Why not `itertools.groupby`?** It only groups *consecutive* equal keys, so it needs sorted input; this version
  does not.
- **How would you write it before Python 3.12?** `T = TypeVar("T")` and `K = TypeVar("K")` at module level, the
  same signature without the brackets after the name.

### Parse a mixed batch of documents with a discriminated union {medium}

A queue delivers JSON messages, each with a `type` field: `"lab_result"` (`patient_id`, `loinc`, `value`, `unit`) or
`"appointment"` (`patient_id`, `start`, a datetime, and `minutes`, 5–240). Write `parse_batch(messages)` that returns
the parsed objects in order and a list of `(index, error_type)` for the failures, using a single `TypeAdapter`.

#### Hints

1. Give each model a `type: Literal[...]` field and combine them with `Field(discriminator="type")`.
2. Build the `TypeAdapter` once, outside the loop.
3. Unknown `type` values produce the error type `union_tag_invalid`.

#### Solution

A discriminated union picks the model from the tag, so each message validates against exactly one schema.

```python
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter, ValidationError


class LabResult(BaseModel):
    type: Literal["lab_result"]
    patient_id: str
    loinc: str = Field(pattern=r"^\d{1,5}-\d$")      # LOINC codes look like 2345-7
    value: float
    unit: str


class Appointment(BaseModel):
    type: Literal["appointment"]
    patient_id: str
    start: datetime
    minutes: int = Field(ge=5, le=240)


Message = Annotated[LabResult | Appointment, Field(discriminator="type")]
MESSAGE = TypeAdapter(Message)                      # build once, reuse


def parse_batch(messages: list[str]) -> tuple[list[LabResult | Appointment], list[tuple[int, str]]]:
    parsed: list[LabResult | Appointment] = []
    failed: list[tuple[int, str]] = []
    for i, raw in enumerate(messages):
        try:
            parsed.append(MESSAGE.validate_json(raw))
        except ValidationError as e:
            failed.append((i, e.errors()[0]["type"]))
    return parsed, failed


parsed, failed = parse_batch([
    '{"type": "lab_result", "patient_id": "P1", "loinc": "2345-7", "value": 98, "unit": "mg/dL"}',
    '{"type": "appointment", "patient_id": "P1", "start": "2026-10-13T09:30:00", "minutes": 30}',
    '{"type": "appointment", "patient_id": "P2", "start": "2026-10-13T10:00:00", "minutes": 600}',
    '{"type": "invoice", "patient_id": "P3"}',
    '{"type": "lab_result", "patient_id": "P4", "loinc": "glucose", "value": 1, "unit": "x"}',
])
assert [type(m).__name__ for m in parsed] == ["LabResult", "Appointment"]
assert parsed[1].start == datetime(2026, 10, 13, 9, 30)
assert failed == [(2, "less_than_equal"), (3, "union_tag_invalid"), (4, "string_pattern_mismatch")]
print("batch parsing ok")
```

O(total message size).

#### Follow-ups

- **What happens to failed messages in production?** Send them to a dead-letter queue with the error, alert on the
  rate, and never drop them silently.
- **Why not a plain union?** Pydantic would validate against every model and pick the best match: slower, ambiguous
  when shapes overlap, and the errors list every model's failures.
