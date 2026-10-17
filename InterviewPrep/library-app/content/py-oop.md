---
title: Classes and OOP
goal: Explain how Python classes really work (attribute lookup, the MRO, dunder methods, dataclasses) and design small class hierarchies live without over-engineering them.
minutes: 50
---

OOP questions come up in almost every Python interview, and they test two things. First, do you know how Python's object model actually works: `__new__` vs `__init__`, how `super()` follows the MRO, and why defining `__eq__` breaks hashing. Second, can you design a few clean classes for a small domain (patients, appointments, claims) without building a Java-style hierarchy?

Focus on the `{core}` questions first. For each one, practise saying the first paragraph of the answer out loud. Python's motto applies here: **simple is better than complex**. Prefer composition, dataclasses and plain functions, and inherit only when there is a real "is-a" relationship.

## How attribute lookup works

When you write `obj.name`, Python searches in this order:

1. **Data descriptors** on the class (for example a `@property`), found by walking the MRO.
2. The **instance's own `__dict__`**.
3. **Non-data descriptors and plain class attributes**, walking the class and its bases in **MRO** order. Methods live here.
4. If nothing is found, `__getattr__` is called if the class defines it. Otherwise you get `AttributeError`.

Methods are functions stored on the class. When you read `obj.method`, the function's descriptor binds it to `obj`, and that bound method is why `self` is passed automatically.

```python
class Patient:
    species = "human"  # class attribute: shared by every instance

    def __init__(self, name: str) -> None:
        self.name = name  # instance attribute: lives in self.__dict__

    def greet(self) -> str:
        return f"Hello, {self.name}"


p = Patient("Ana")
assert p.__dict__ == {"name": "Ana"}          # only instance data
assert "greet" in Patient.__dict__             # methods live on the class
assert p.greet() == Patient.greet(p)           # a bound method passes self for you
p.species = "override"                         # creates an instance attribute...
assert Patient.species == "human"              # ...the class attribute is untouched
```

## The kinds of method

| Kind | Decorator | First argument | Use it for |
|---|---|---|---|
| Instance method | none | `self` | Behaviour that uses instance state |
| Class method | `@classmethod` | `cls` | Alternative constructors (`from_dict`, `from_hl7`), and factories that respect subclasses |
| Static method | `@staticmethod` | none | A helper that belongs with the class but needs no instance or class state |
| Property | `@property` | `self` | Computed or validated attributes behind a plain `obj.attr` syntax |

```python
from datetime import date


class Member:
    def __init__(self, member_id: str, dob: date) -> None:
        self.member_id = member_id
        self.dob = dob

    @classmethod
    def from_record(cls, record: dict) -> "Member":
        # Alternative constructor. Using cls (not Member) means subclasses get instances of themselves.
        return cls(record["id"], date.fromisoformat(record["dob"]))

    @staticmethod
    def is_valid_id(member_id: str) -> bool:
        return member_id.isalnum() and len(member_id) == 9

    @property
    def age(self) -> int:
        today = date(2026, 10, 13)
        return today.year - self.dob.year - ((today.month, today.day) < (self.dob.month, self.dob.day))


class MedicaidMember(Member):
    pass


m = MedicaidMember.from_record({"id": "ABC123456", "dob": "1990-12-01"})
assert type(m) is MedicaidMember        # classmethod built the subclass
assert Member.is_valid_id("ABC123456")
assert m.age == 35                       # property: read like an attribute
```

## Inheritance, super() and the MRO

Python supports multiple inheritance. The **method resolution order (MRO)** is the order in which classes are searched. It is computed with the **C3 linearisation**, which guarantees that a child comes before its parents and that the order of bases you wrote is preserved.

`super()` does **not** mean "my parent". It means "the next class after me in the MRO of the actual object". That is what makes cooperative multiple inheritance work: in a diamond, each class calls `super()` and every class runs exactly once.

```python
calls: list[str] = []


class Base:
    def save(self) -> None:
        calls.append("Base")


class AuditMixin(Base):
    def save(self) -> None:
        calls.append("Audit")
        super().save()


class ValidateMixin(Base):
    def save(self) -> None:
        calls.append("Validate")
        super().save()


class Claim(AuditMixin, ValidateMixin):
    def save(self) -> None:
        calls.append("Claim")
        super().save()


assert [c.__name__ for c in Claim.__mro__] == ["Claim", "AuditMixin", "ValidateMixin", "Base", "object"]
Claim().save()
assert calls == ["Claim", "Audit", "Validate", "Base"]  # Base runs once, not twice
```

Notice that `AuditMixin`'s `super()` called `ValidateMixin`, which is not its parent. That is the MRO at work.

## Dunder methods worth knowing

| Method | Called by | Notes |
|---|---|---|
| `__init__` | `Cls(...)` after the object exists | Initialises; must return `None` |
| `__new__` | `Cls(...)` first | Creates the instance; needed for immutable types and singletons |
| `__repr__` | `repr(obj)`, the REPL, debuggers | Unambiguous, ideally `Cls(field=...)` |
| `__str__` | `str(obj)`, `print`, f-strings | Readable; falls back to `__repr__` |
| `__eq__` / `__hash__` | `==`, dict keys, sets | Equal objects must have equal hashes |
| `__lt__` etc. | `<`, `sorted()` | `functools.total_ordering` fills in the rest from `__eq__` + one |
| `__len__`, `__getitem__`, `__iter__`, `__contains__` | `len`, `[]`, `for`, `in` | Make a class behave like a collection |
| `__call__` | `obj(...)` | Callable objects, for example stateful strategies |
| `__enter__` / `__exit__` | `with` | Context managers (see the errors chapter) |
| `__add__`, `__radd__`, … | operators | Return `NotImplemented` for unsupported types |

## Dataclasses

`@dataclass` writes the boilerplate for you: `__init__`, `__repr__` and `__eq__`. With options it also adds ordering, immutability and `__slots__`. Use it for classes that are mostly data.

```python
from dataclasses import FrozenInstanceError, dataclass, field


@dataclass(frozen=True, slots=True)
class Code:
    system: str   # e.g. "ICD-10-CM"
    value: str    # e.g. "E11.9"


@dataclass(order=True)
class Encounter:
    priority: int
    patient_id: str = field(compare=False)
    codes: list[Code] = field(default_factory=list, compare=False)  # never a shared [] default


a = Encounter(2, "p1")
b = Encounter(1, "p2", [Code("ICD-10-CM", "E11.9")])
assert sorted([a, b])[0] is b               # order=True compares by priority only
assert a.codes is not Encounter(3, "p3").codes  # each instance gets its own list

c = Code("ICD-10-CM", "E11.9")
assert c == Code("ICD-10-CM", "E11.9") and len({c, Code("ICD-10-CM", "E11.9")}) == 1  # frozen → hashable
try:
    c.value = "I10"  # type: ignore[misc]
    raise AssertionError("should be frozen")
except FrozenInstanceError:
    pass
```

## Composition, SOLID and Pythonic patterns

**Composition over inheritance.** A `ClaimProcessor` that *has* a `Validator` and a `Notifier` is easier to test and change than a `ClaimProcessor` that inherits from both. Inheritance couples you to every detail of the parent. Composition couples you only to an interface.

**SOLID, the Python way:**

- **S**ingle responsibility: a class does one job. Parsing an 837 file and saving to the database are separate jobs.
- **O**pen/closed: add behaviour by adding a class or function (a new strategy), not by editing a growing `if/elif` chain.
- **L**iskov substitution: a subclass must work anywhere the parent does. A `ReadOnlyRepo` that raises on `save()` breaks this.
- **I**nterface segregation: small `Protocol`s (`Readable`, `Writable`) instead of one fat base class.
- **D**ependency inversion: depend on abstractions and pass dependencies in. FastAPI's `Depends` is dependency injection.

**Patterns, simplified by first-class functions:**

| Pattern | Pythonic form |
|---|---|
| Singleton | A module-level instance (modules are imported once), or `functools.cache` on a factory |
| Factory | A `@classmethod` constructor, or a dict mapping names to classes |
| Strategy | Pass a function (or any callable) instead of building a class hierarchy |
| Observer | A list of callbacks, or an event bus mapping event names to handlers |
| Decorator | Python's `@decorator` syntax, or a wrapper class with the same interface |
| Dependency injection | Constructor parameters; FastAPI `Depends`; `dependency_overrides` in tests |

```python
from typing import Callable, Protocol


class Notifier(Protocol):
    def send(self, to: str, message: str) -> None: ...


class FakeNotifier:  # no inheritance needed: it simply matches the Protocol
    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    def send(self, to: str, message: str) -> None:
        self.sent.append((to, message))


PricingRule = Callable[[float], float]  # strategy as a plain function type


class ClaimService:
    def __init__(self, notifier: Notifier, pricing: PricingRule) -> None:  # dependencies injected
        self.notifier = notifier
        self.pricing = pricing

    def approve(self, member: str, billed: float) -> float:
        allowed = self.pricing(billed)
        self.notifier.send(member, f"Approved {allowed:.2f}")
        return allowed


fake = FakeNotifier()
service = ClaimService(fake, pricing=lambda billed: round(billed * 0.8, 2))
assert service.approve("m1", 100.0) == 80.0
assert fake.sent == [("m1", "Approved 80.00")]
```

**Your angle:** in the Document AI platform, validation, review and submission were separate steps, each with one job. That is single responsibility. Passing the external submission client in, rather than creating it inside, is what lets a test swap in a fake: dependency inversion.

## Interview questions

### What is the difference between `__new__` and `__init__`? {core}

`__new__` **creates** the object. It is a static method that receives the class and returns a new instance. `__init__` **initialises** that instance and returns `None`. Python calls `__new__` first, then calls `__init__` only if `__new__` returned an instance of the class.

You almost never override `__new__`. The real cases are subclassing immutable types (`int`, `str`, `tuple`), where the value must be set at creation because `__init__` is too late, plus singletons, instance caching and metaclass work.

```python
class UpperStr(str):
    def __new__(cls, value: str) -> "UpperStr":
        return super().__new__(cls, value.upper())  # str is immutable: set the value in __new__


assert UpperStr("e11.9") == "E11.9"
```

### Instance method vs class method vs static method? {core}

An **instance method** gets `self` and works with one object's state. A **class method** gets `cls` and works at the class level. Its main use is alternative constructors like `Patient.from_fhir(json)`, and because it receives `cls`, it builds the right subclass. A **static method** gets neither. It is a plain function namespaced inside the class because it belongs there logically, like `is_valid_npi(value)`.

A useful test: if the helper doesn't need `self` or `cls`, ask whether it should just be a module-level function. In Python that is often cleaner.

### What does `@property` give you, and when would you use it? {core}

`@property` turns a method into an attribute you read without parentheses. It lets you start with a plain public attribute and later add validation or computation **without changing any caller**. That is why Python doesn't need Java-style getters and setters.

Use it for derived values (`age` from `dob`, `full_name`) and for validated setters. Keep properties cheap: a property that runs a database query surprises readers.

```python
class Dosage:
    def __init__(self, mg: float) -> None:
        self.mg = mg  # goes through the setter below

    @property
    def mg(self) -> float:
        return self._mg

    @mg.setter
    def mg(self, value: float) -> None:
        if value <= 0:
            raise ValueError("dose must be positive")
        self._mg = value


d = Dosage(5)
try:
    d.mg = -1
    raise AssertionError
except ValueError:
    assert d.mg == 5
```

### How does `super()` work? What is the MRO? {core}

The **MRO** (method resolution order) is the list of classes Python searches for an attribute, available as `Cls.__mro__`. Python computes it with the **C3 linearisation**: children come before parents, and the left-to-right order of bases is kept.

`super()` returns a proxy that looks up the **next class in the MRO of the instance's actual type**. It does not simply mean "my parent". In multiple inheritance, `super()` inside a mixin may call a sibling class. That is how cooperative inheritance runs every class in a diamond exactly once. The rule for cooperative classes: every class in the chain calls `super()`, and they accept and forward `**kwargs`.

### What is the diamond problem, and how does Python handle it? {deep}

The diamond appears when `D(B, C)` and both `B` and `C` inherit from `A`. The question is whether `A`'s method runs once or twice, and which version wins. Python's C3 MRO gives a single, consistent order: `D, B, C, A, object`. If every class uses `super()`, `A` runs exactly once. If the bases are written in an order that makes a consistent MRO impossible, Python raises `TypeError` when the class is defined, not at runtime.

The danger is mixing styles. If one class calls `A.method(self)` directly instead of `super().method()`, the chain breaks and methods get skipped or run twice.

### What is a mixin? {deep}

A mixin is a small class that adds one piece of behaviour (`JsonSerializableMixin`, `AuditMixin`, `TimestampMixin`) and is meant to be combined with other classes, never used alone. Mixins usually have no `__init__` of their own, or a cooperative one, and they call `super()` so they can be stacked. Put mixins to the **left** of the main base class: `class Claim(AuditMixin, BaseModel)`. That way their methods come first in the MRO.

### Abstract base classes vs Protocols? {core}

An **ABC** (`abc.ABC` with `@abstractmethod`) is **nominal** typing. Subclasses must explicitly inherit and implement the abstract methods, and Python refuses to instantiate a class that hasn't (`TypeError`). Use it when you own the hierarchy and want enforcement at runtime.

A **`typing.Protocol`** is **structural** typing, like a checked version of duck typing: any class with matching methods satisfies it, with no inheritance. It is checked by mypy or pyright, and optionally at runtime with `@runtime_checkable` (which only checks that the method names exist). Use Protocols at boundaries where you don't control the implementations, such as a notifier, a storage client or a fake in tests.

```python
from abc import ABC, abstractmethod
from typing import Protocol, runtime_checkable


class Shape(ABC):
    @abstractmethod
    def area(self) -> float: ...


try:
    Shape()  # type: ignore[abstract]
    raise AssertionError
except TypeError:
    pass


@runtime_checkable
class HasArea(Protocol):
    def area(self) -> float: ...


class Square:  # no inheritance
    def __init__(self, side: float) -> None:
        self.side = side

    def area(self) -> float:
        return self.side**2


assert isinstance(Square(2), HasArea)
```

### `__repr__` vs `__str__`? {core}

`__repr__` is for developers. It should be unambiguous and, ideally, look like code that recreates the object: `Patient(id='p1', name='Ana')`. It is what you see in the REPL, in debuggers, and when the object sits inside a list or dict that gets printed. `__str__` is for end users and is what `print` and f-strings use. If you define only one, define `__repr__`, because `str()` falls back to it. Dataclasses generate a good `__repr__` for you.

In healthcare code, be careful that `__repr__` doesn't leak PHI into logs. Exclude sensitive fields with `field(repr=False)`.

### How do `__eq__` and `__hash__` relate? {core}

The contract: **if `a == b`, then `hash(a) == hash(b)`**. Sets and dicts first compare hashes, then use `==`, so breaking the rule makes lookups silently fail. Because of this, **defining `__eq__` without `__hash__` sets `__hash__` to `None`**, and the instances become unhashable. Python does that deliberately to protect you.

If the object is immutable, define `__hash__` from the same fields that `__eq__` compares, for example `hash((self.system, self.value))`. If it is mutable, leave it unhashable. A mutable key whose hash changes after insertion gets "lost" in the dict. With dataclasses, `@dataclass(frozen=True)` gives you a matching `__eq__` and `__hash__`.

```python
class Npi:
    def __init__(self, value: str) -> None:
        self.value = value

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Npi) and self.value == other.value


assert Npi.__hash__ is None  # defining __eq__ removed the default hash
try:
    {Npi("1234567893")}
    raise AssertionError
except TypeError:
    pass
```

### What does `@dataclass` generate, and what are its key options? {core}

By default it generates `__init__`, `__repr__` and `__eq__` from the annotated class fields. The options:

- `frozen=True`: assigning to a field raises `FrozenInstanceError`, and you get a `__hash__`.
- `order=True`: `<`, `<=`, `>` and `>=` compare fields as a tuple, in order.
- `slots=True` (3.10+): generates `__slots__`, giving less memory and faster attribute access.
- `kw_only=True` (3.10+): fields must be passed by keyword.
- `field(default_factory=list)`: a new mutable default for every instance.
- `field(repr=False, compare=False)`: leave a field out of the repr or the comparisons.
- `__post_init__`: runs after the generated `__init__`, for validation or derived fields.

Dataclasses don't validate types at runtime. For untrusted input (API bodies, LLM output), use Pydantic.

### Why `field(default_factory=list)` instead of `= []`? {core}

A default value is evaluated **once**, when the class is defined, so `codes: list = []` would share one list across every instance. That is the same bug as a mutable default argument in a function. Dataclasses refuse it: an unhashable default such as a list, dict or set raises `ValueError` at class definition. `default_factory` calls the factory for each new instance.

### What does `__slots__` do? {deep}

`__slots__ = ("id", "name")` replaces the per-instance `__dict__` with fixed storage for just those attributes. Instances use noticeably less memory, attribute access is a little faster, and typos like `p.nmae = ...` raise `AttributeError` instead of silently creating a new attribute.

The costs: you can't add arbitrary attributes, and `__weakref__` must be listed if you need weak references. Each class in an inheritance chain needs its own `__slots__` for the saving to hold. Use it when you have millions of small objects, such as parsed claim lines. `@dataclass(slots=True)` does it for you.

```python
class Point:
    __slots__ = ("x", "y")

    def __init__(self, x: int, y: int) -> None:
        self.x, self.y = x, y


p = Point(1, 2)
assert not hasattr(p, "__dict__")
try:
    p.z = 3  # type: ignore[attr-defined]
    raise AssertionError
except AttributeError:
    pass
```

### How does Python do encapsulation? What do `_x` and `__x` mean? {core}

Python has no private keyword. Encapsulation works by convention. A single underscore, `_balance`, means "internal: don't touch from outside". Tools and readers respect it, but nothing stops access. A double underscore, `__balance`, triggers **name mangling**: inside class `Account` it becomes `_Account__balance`. The point is to avoid accidental name clashes with subclasses, not security.

Use `_single` for internals and `@property` for controlled public access. Reach for `__double` only when you expect subclasses to reuse attribute names.

```python
class Account:
    def __init__(self) -> None:
        self._internal = 1
        self.__mangled = 2


a = Account()
assert a._internal == 1
assert a._Account__mangled == 2  # type: ignore[attr-defined]
assert not hasattr(a, "__mangled")
```

### Composition or inheritance: how do you choose? {core}

Use inheritance only for a true **is-a** relationship where the subclass can stand in for the parent everywhere (Liskov). Use composition (**has-a**) for everything else: an object holds collaborators and delegates to them.

Composition is usually better because it is looser coupling. You can swap a collaborator, and tests can inject fakes. It also avoids deep, fragile hierarchies where a change in the base class ripples down. A good rule: inherit from framework base classes (`BaseModel`, `Exception`, `ABC`), and compose your own domain logic.

**Your angle:** the Document AI pipeline is a natural composition example: separate stages (extraction output, a Pydantic validation gate, human review, external submission), each replaceable on its own.

### Explain SOLID with a Python example. {core}

Pick one principle and make it concrete instead of reciting all five. For example, **dependency inversion**: a `ClaimService` shouldn't create its own `SmtpNotifier`. It should receive something that satisfies a `Notifier` protocol in its constructor. Production passes the real notifier, and tests pass a fake that records messages. That one choice also helps **single responsibility** (the service doesn't know about email) and **open/closed** (add an SMS notifier without editing the service).

Then mention that Python makes several SOLID patterns lighter: Protocols give you interface segregation without inheritance, and first-class functions replace many single-method strategy classes.

### How would you implement a singleton in Python? {deep}

The Pythonic answer: **you rarely need one, and a module already is one**. Modules are imported once and cached in `sys.modules`, so a module-level `settings = Settings()` or `client = HttpClient()` is shared everywhere. For lazy creation, put `@functools.cache` on a `get_settings()` factory. FastAPI's documentation does this for settings.

If you must enforce it on a class, override `__new__` to return a cached instance. Mention the trade-offs: singletons are hidden global state, so they hurt testing and concurrency. Prefer dependency injection.

```python
from functools import cache


class Settings:
    def __init__(self) -> None:
        self.db_url = "sqlite://"


@cache
def get_settings() -> Settings:
    return Settings()


assert get_settings() is get_settings()
```

### How do first-class functions change the Strategy pattern? {deep}

In Java, Strategy means an interface plus one class per algorithm. In Python, functions are objects, so a strategy can simply be a callable you pass in: `sorted(claims, key=by_amount)`, or `ClaimService(pricing=medicaid_rate)`. Use a class only when the strategy needs state or several related methods. A class with `__call__` gives you both: it carries state and is still called like a function.

### What is the difference between class and instance attributes, and what is the classic bug? {core}

A **class attribute** is defined in the class body and shared by all instances. An **instance attribute** is set on `self`, usually in `__init__`. Reading `obj.x` finds the instance attribute first and falls back to the class one.

The classic bug is a **mutable class attribute**: `class Cart: items = []`. Then `cart.items.append(x)` mutates the shared list, so every cart sees every item. Assigning `self.items = ...` would create an instance attribute instead, which makes the bug confusing. Fix it by creating mutable state in `__init__`.

```python
class Cart:
    items: list[str] = []  # bug: shared by every Cart


a, b = Cart(), Cart()
a.items.append("x")
assert b.items == ["x"]  # surprise
```

### What is duck typing? {core}

"If it walks like a duck and quacks like a duck, it's a duck." Python cares about what an object **can do**, not what class it is. Any object with `.read()` works where a file is expected, and any object with `__iter__` works in a `for` loop. That is why you rarely check `isinstance` in idiomatic code. `typing.Protocol` lets a static type checker verify duck typing.

### How do you make objects sortable and support operators? {deep}

Implement rich comparisons. With `@functools.total_ordering` you define `__eq__` plus one of `__lt__`, `__le__`, `__gt__` or `__ge__`, and the rest are derived. For arithmetic, implement `__add__` and `__radd__`, and return `NotImplemented`, not an exception, for unsupported types so that Python can try the other operand. For simple data, `@dataclass(order=True)` is shorter. Often you don't need any of this: `sorted(items, key=attrgetter("priority"))` sorts without touching the class.

### What is a descriptor? {deep}

A descriptor is any object whose class defines `__get__`, and optionally `__set__` or `__delete__`. When it is stored as a class attribute, attribute access on instances is routed through those methods. **`property`, `classmethod`, `staticmethod` and plain functions (which produce bound methods) are all descriptors.** Data descriptors, which define `__set__`, take priority over the instance `__dict__`. ORMs use descriptors for columns (SQLAlchemy's mapped attributes are descriptors on the class), and so do validation libraries.

### What is a metaclass? When would you use one? {deep}

A metaclass is the class of a class: classes are instances of `type` by default. A custom metaclass can change how classes are created, for example by registering them, validating their attributes or adding methods. Django's `Model` uses one (`ModelBase`), and so does SQLAlchemy's `DeclarativeBase`.

The honest interview answer is that you rarely need one. `__init_subclass__` (for registering or validating subclasses) and class decorators cover most cases more simply.

```python
class Handler:
    registry: dict[str, type["Handler"]] = {}

    def __init_subclass__(cls, *, message_type: str, **kwargs: object) -> None:
        super().__init_subclass__(**kwargs)
        Handler.registry[message_type] = cls  # registers every subclass, no metaclass needed


class AdtHandler(Handler, message_type="ADT"):
    pass


class OruHandler(Handler, message_type="ORU"):
    pass


assert Handler.registry == {"ADT": AdtHandler, "ORU": OruHandler}
```

### Is everything in Python an object? What does `type(obj)` vs `isinstance` tell you? {deep}

Yes. Integers, functions, classes and modules are all objects with a type. `type(obj)` returns the exact class. `isinstance(obj, Cls)` also returns `True` for subclasses and for virtual subclasses registered with an ABC, so it respects inheritance. Prefer `isinstance` (or no check at all, which is duck typing). Use `type(a) is type(b)` only when subclasses must not match, for example inside a strict `__eq__`.

## Coding problems

### Bank account with validation {easy core}

Design a `BankAccount` class with `deposit(amount)`, `withdraw(amount)` and a read-only `balance`. Deposits and withdrawals must be positive, and you can't withdraw more than the balance. Raise meaningful exceptions, and keep a transaction history.

Example: `acct = BankAccount("Ana", 100); acct.withdraw(30); acct.balance → 70`.

#### Hints

1. The balance should not be settable from outside: store it in `_balance` and expose a `@property` without a setter.
2. Create custom exceptions (`InvalidAmountError`, `InsufficientFundsError`) that subclass `ValueError`, so callers can catch either the specific error or `ValueError`.
3. Record each transaction as a small immutable record (a frozen dataclass) in a list.

#### Solution

Interviewers look for encapsulation (no public setter), validation in one place, and specific exceptions instead of `print` statements or returning `False`. Use `Decimal` for money if they ask. Floats can't represent cents exactly.

```python
from dataclasses import dataclass
from decimal import Decimal


class InvalidAmountError(ValueError):
    pass


class InsufficientFundsError(ValueError):
    pass


@dataclass(frozen=True)
class Transaction:
    kind: str
    amount: Decimal


class BankAccount:
    def __init__(self, owner: str, opening: Decimal | int = 0) -> None:
        self.owner = owner
        self._balance = Decimal(0)
        self._history: list[Transaction] = []
        if opening:
            self.deposit(opening)

    @property
    def balance(self) -> Decimal:
        return self._balance

    @property
    def history(self) -> tuple[Transaction, ...]:
        return tuple(self._history)  # a copy, so callers can't edit it

    @staticmethod
    def _validate(amount: Decimal | int) -> Decimal:
        value = Decimal(amount)
        if value <= 0:
            raise InvalidAmountError(f"amount must be positive, got {amount}")
        return value

    def deposit(self, amount: Decimal | int) -> None:
        value = self._validate(amount)
        self._balance += value
        self._history.append(Transaction("deposit", value))

    def withdraw(self, amount: Decimal | int) -> None:
        value = self._validate(amount)
        if value > self._balance:
            raise InsufficientFundsError(f"balance {self._balance} < {value}")
        self._balance -= value
        self._history.append(Transaction("withdraw", value))

    def __repr__(self) -> str:
        return f"BankAccount(owner={self.owner!r}, balance={self._balance})"


acct = BankAccount("Ana", 100)
acct.withdraw(30)
assert acct.balance == Decimal(70)
assert [t.kind for t in acct.history] == ["deposit", "withdraw"]
for bad in (0, -5):
    try:
        acct.deposit(bad)
        raise AssertionError
    except InvalidAmountError:
        pass
try:
    acct.withdraw(1000)
    raise AssertionError
except ValueError as e:  # the specific error is also a ValueError
    assert isinstance(e, InsufficientFundsError)
try:
    acct.balance = 5  # type: ignore[misc]
    raise AssertionError
except AttributeError:
    pass
assert acct.balance == 70
```

Complexity: each operation is O(1). History grows by one entry per transaction.

#### Follow-ups

- **How would you make it thread-safe?** Guard `deposit` and `withdraw` with a `threading.Lock`, because the check-then-update in `withdraw` is a race. In a real system, the database transaction does this (`SELECT … FOR UPDATE`, or an atomic `UPDATE … WHERE balance >= :amt`).
- **Why `Decimal`?** `0.1 + 0.2 != 0.3` in binary floating point. Money needs exact decimal arithmetic.

### Appointment scheduler with conflict detection {medium core}

Write a `Schedule` class for one provider. `book(patient_id, start, end)` adds an appointment if it doesn't overlap an existing one, and raises `ConflictError` otherwise. `appointments()` returns them sorted by start time. Times are `datetime` objects, and an appointment that ends at 10:00 does **not** conflict with one starting at 10:00.

#### Hints

1. Two half-open intervals `[s1, e1)` and `[s2, e2)` overlap exactly when `s1 < e2 and s2 < e1`.
2. A frozen dataclass with `order=True` and `start` as the first field sorts naturally by start time.
3. For a linear check, test the new slot against every existing appointment. If they ask for faster, keep the list sorted and use `bisect` to check only the neighbours.

#### Solution

Model the appointment as a frozen dataclass and validate `start < end`. The overlap test is the part interviewers check: get the boundary right (touching is allowed). The simple version scans all appointments in O(n). The `bisect` version keeps the list sorted, so only the appointment just before and the one just after the insertion point need checking: O(log n) to find them, plus O(n) for the list insert.

```python
from bisect import bisect_left
from dataclasses import dataclass, field
from datetime import datetime


class ConflictError(Exception):
    pass


@dataclass(frozen=True, order=True)
class Appointment:
    start: datetime
    end: datetime
    patient_id: str = field(compare=False)

    def __post_init__(self) -> None:
        if self.start >= self.end:
            raise ValueError("start must be before end")

    def overlaps(self, other: "Appointment") -> bool:
        return self.start < other.end and other.start < self.end


class Schedule:
    def __init__(self) -> None:
        self._items: list[Appointment] = []  # always sorted by start

    def book(self, patient_id: str, start: datetime, end: datetime) -> Appointment:
        new = Appointment(start, end, patient_id)
        i = bisect_left(self._items, new)
        neighbours = self._items[max(i - 1, 0) : i + 1]  # only these can overlap in a sorted, non-overlapping list
        for existing in neighbours:
            if new.overlaps(existing):
                raise ConflictError(f"{patient_id} conflicts with {existing.patient_id}")
        self._items.insert(i, new)
        return new

    def appointments(self) -> list[Appointment]:
        return list(self._items)


d = lambda h, m=0: datetime(2026, 10, 13, h, m)
s = Schedule()
s.book("p2", d(11), d(12))
s.book("p1", d(9), d(10))
s.book("p3", d(10), d(11))  # touching both neighbours is fine
assert [a.patient_id for a in s.appointments()] == ["p1", "p3", "p2"]
for start, end in [(d(9, 30), d(10, 30)), (d(8), d(13)), (d(11, 15), d(11, 45))]:
    try:
        s.book("x", start, end)
        raise AssertionError("expected conflict")
    except ConflictError:
        pass
try:
    s.book("bad", d(14), d(13))
    raise AssertionError
except ValueError:
    pass
```

Complexity: `book` is O(log n) to find the position, plus O(n) for `list.insert`. A sorted container or balanced tree would make the insert O(log n) too.

#### Follow-ups

- **Many providers?** Keep `dict[provider_id, Schedule]`.
- **Store it in a database?** In PostgreSQL, an exclusion constraint on a `tstzrange` column (`EXCLUDE USING gist (provider_id WITH =, slot WITH &&)`, which needs the `btree_gist` extension for the `=` part) enforces no overlaps even under concurrent bookings. An in-memory check can't do that.

### Shapes with an abstract base class {easy}

Create an abstract `Shape` with an abstract `area()` method and a concrete `describe()` method that returns `"<ClassName> with area <a>"` rounded to 2 decimals. Implement `Circle` and `Rectangle`. Then write `total_area(shapes)`.

#### Hints

1. `from abc import ABC, abstractmethod`. `Shape()` should then raise `TypeError`.
2. `describe()` can call `self.area()` and use `type(self).__name__`. This is the template method pattern.

#### Solution

The abstract method forces every subclass to implement `area`. The shared `describe` lives once in the base class. `total_area` relies on polymorphism, so there is no `isinstance` chain.

```python
import math
from abc import ABC, abstractmethod


class Shape(ABC):
    @abstractmethod
    def area(self) -> float: ...

    def describe(self) -> str:
        return f"{type(self).__name__} with area {self.area():.2f}"


class Circle(Shape):
    def __init__(self, r: float) -> None:
        self.r = r

    def area(self) -> float:
        return math.pi * self.r**2


class Rectangle(Shape):
    def __init__(self, w: float, h: float) -> None:
        self.w, self.h = w, h

    def area(self) -> float:
        return self.w * self.h


def total_area(shapes: list[Shape]) -> float:
    return sum(s.area() for s in shapes)


assert Circle(1).describe() == "Circle with area 3.14"
assert Rectangle(2, 3).describe() == "Rectangle with area 6.00"
assert math.isclose(total_area([Circle(1), Rectangle(2, 3)]), math.pi + 6)
assert total_area([]) == 0
try:
    Shape()  # type: ignore[abstract]
    raise AssertionError
except TypeError:
    pass
```

Complexity: `total_area` is O(n).

#### Follow-ups

- **Add a Square.** `class Square(Rectangle)` with `w == h` works. But if `Rectangle` had `set_width`, a square would break Liskov substitution, the classic LSP example. Composition, or an immutable shape, avoids it.

### Money value object with operators {medium}

Implement an immutable `Money(amount, currency)` value object. It should support `+` and `-` with the same currency, `* int`, `==`, hashing (so it works in sets and as a dict key), sorting within one currency, and `sum()` over a list. Adding different currencies raises `ValueError`.

#### Hints

1. A frozen dataclass gives you immutability, `__eq__` and `__hash__`.
2. `sum()` starts from `0`, so you need `__radd__` that accepts `0`.
3. Return `NotImplemented` from an operator when the other operand's type is unsupported. Python then raises a proper `TypeError`.

#### Solution

This tests dunder methods and the hash/eq contract. Store the amount as `Decimal`. Don't use `order=True`: it compares `(amount, currency)` tuples and would happily order USD against EUR. Write a `__lt__` that checks the currency, and let `total_ordering` derive `<=`, `>` and `>=`.

```python
from dataclasses import dataclass
from decimal import Decimal
from functools import total_ordering


@total_ordering
@dataclass(frozen=True)
class Money:
    amount: Decimal
    currency: str = "USD"

    def __post_init__(self) -> None:
        object.__setattr__(self, "amount", Decimal(self.amount))  # normalise even though frozen

    def _check(self, other: "Money") -> None:
        if self.currency != other.currency:
            raise ValueError(f"currency mismatch: {self.currency} vs {other.currency}")

    def __add__(self, other: object) -> "Money":
        if not isinstance(other, Money):
            return NotImplemented
        self._check(other)
        return Money(self.amount + other.amount, self.currency)

    def __radd__(self, other: object) -> "Money":
        if other == 0:  # lets sum() start from 0
            return self
        return self.__add__(other)

    def __sub__(self, other: object) -> "Money":
        if not isinstance(other, Money):
            return NotImplemented
        self._check(other)
        return Money(self.amount - other.amount, self.currency)

    def __mul__(self, factor: object) -> "Money":
        if not isinstance(factor, int):
            return NotImplemented
        return Money(self.amount * factor, self.currency)

    __rmul__ = __mul__

    def __lt__(self, other: object) -> bool:
        if not isinstance(other, Money):
            return NotImplemented
        self._check(other)
        return self.amount < other.amount


a, b = Money(Decimal("10.50")), Money(Decimal("4.25"))
assert a + b == Money(Decimal("14.75"))
assert a - b == Money(Decimal("6.25"))
assert 2 * b == b * 2 == Money(Decimal("8.50"))
assert sum([a, b, b]) == Money(Decimal("19.00"))
assert sorted([a, b]) == [b, a] and a >= b
assert len({Money(Decimal("1")), Money(Decimal("1.0"))}) == 1  # Decimal("1") == Decimal("1.0"), equal hashes too
try:
    a + Money(Decimal("1"), "EUR")
    raise AssertionError
except ValueError:
    pass
try:
    a + 5  # type: ignore[operator]
    raise AssertionError
except TypeError:
    pass
```

Complexity: every operation is O(1).

#### Follow-ups

- **Why `object.__setattr__` in `__post_init__`?** The dataclass is frozen, so normal assignment raises an error. This is the documented escape hatch for normalising a field during construction.
- **Rounding?** Use `amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)` at the boundaries (display, persistence), not on every operation.

### Event bus (observer pattern) {medium}

Build an `EventBus` with `subscribe(event, handler)`, `unsubscribe(event, handler)` and `publish(event, payload)`. `publish` calls every handler for that event in subscription order and returns how many handlers ran. One failing handler must not stop the others. Collect the errors and return them too.

Example: subscribe two handlers to `"claim.approved"`, publish a payload, and both are called.

#### Hints

1. Store `dict[str, list[Callable]]`. A `defaultdict(list)` removes the "is the key there?" check.
2. Iterate over a **copy** of the handler list, so a handler that unsubscribes during publish doesn't skip the next one.
3. Wrap each call in `try/except Exception`, and record `(handler name, exception)`.

#### Solution

Handlers are plain callables, so no `Observer` base class is needed. That is Python's version of the pattern. Copying the list before iterating is the detail interviewers like to see. Isolating failures is the production-minded touch.

```python
from collections import defaultdict
from typing import Any, Callable

Handler = Callable[[dict[str, Any]], None]


class EventBus:
    def __init__(self) -> None:
        self._handlers: defaultdict[str, list[Handler]] = defaultdict(list)

    def subscribe(self, event: str, handler: Handler) -> None:
        self._handlers[event].append(handler)

    def unsubscribe(self, event: str, handler: Handler) -> None:
        self._handlers[event].remove(handler)

    def publish(self, event: str, payload: dict[str, Any]) -> tuple[int, list[tuple[str, Exception]]]:
        ran = 0
        errors: list[tuple[str, Exception]] = []
        for handler in list(self._handlers.get(event, [])):  # copy: handlers may unsubscribe
            try:
                handler(payload)
                ran += 1
            except Exception as exc:  # isolate failures
                errors.append((getattr(handler, "__name__", repr(handler)), exc))
        return ran, errors


bus = EventBus()
seen: list[str] = []


def audit(p: dict[str, Any]) -> None:
    seen.append(f"audit {p['id']}")


def broken(p: dict[str, Any]) -> None:
    raise RuntimeError("smtp down")


def notify_once(p: dict[str, Any]) -> None:
    seen.append(f"notify {p['id']}")
    bus.unsubscribe("claim.approved", notify_once)


for h in (audit, broken, notify_once):
    bus.subscribe("claim.approved", h)

ran, errors = bus.publish("claim.approved", {"id": "c1"})
assert ran == 2 and seen == ["audit c1", "notify c1"]
assert errors[0][0] == "broken" and isinstance(errors[0][1], RuntimeError)
ran, _ = bus.publish("claim.approved", {"id": "c2"})
assert ran == 1 and seen[-1] == "audit c2"  # notify_once removed itself
assert bus.publish("unknown", {}) == (0, [])
```

Complexity: `publish` is O(h) for h handlers. `unsubscribe` is O(h) because of `list.remove`.

#### Follow-ups

- **Async handlers?** Make `publish` async and use `asyncio.gather(*calls, return_exceptions=True)`.
- **Across services?** In-process buses don't survive restarts. Use a broker (Pub/Sub, Service Bus, Kafka) for durable, cross-service events.
