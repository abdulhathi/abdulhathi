---
title: Data model, mutability and memory
goal: Explain names versus objects, mutability, identity, copying, hashing and memory management precisely, and spot the classic traps in a code review.
minutes: 40
---

Almost every Python interview opens with a few "how does Python really work" questions. They look simple, but they separate people who write Python from people who understand it. They cover what a variable is, what `is` checks, why a default list keeps growing, and when a copy is not really a copy.

Concentrate on one idea: **names point to objects**. Almost every answer in this chapter follows from it. If you can draw the arrows from names to objects on a whiteboard, you can answer any variation the interviewer throws at you.

## Names, objects and references

In Python, **everything is an object**: numbers, strings, functions, classes and modules. Every object has three things:

| Property | What it is | How to see it |
|---|---|---|
| Identity | Never changes while the object lives (in CPython, the memory address) | `id(obj)`, compared with `is` |
| Type | Decides what the object can do; also fixed | `type(obj)` |
| Value | The data; may or may not be changeable | compared with `==` |

A **variable is a name bound to an object**, not a box that holds a value. Assignment never copies; it just points another name at the same object.

```python
a = [1, 2, 3]
b = a            # b is a second name for the SAME list
b.append(4)
assert a == [1, 2, 3, 4]   # a sees the change: one object, two names
assert a is b

b = [9]          # rebinding b points it at a new object; a is untouched
assert a == [1, 2, 3, 4]
assert a is not b
```

Function arguments work the same way. Python is neither "pass by value" nor "pass by reference"; it is **pass by object reference** (also called pass by assignment). The parameter is a new name bound to the caller's object. Mutating that object is visible to the caller. Rebinding the parameter is not.

```python
def mutate(items: list[int]) -> None:
    items.append(99)        # changes the caller's list

def rebind(items: list[int]) -> None:
    items = [0]             # only changes the local name

data = [1]
mutate(data)
rebind(data)
assert data == [1, 99]
```

## Mutable and immutable types

| Immutable (value can never change) | Mutable (can change in place) |
|---|---|
| `int`, `float`, `complex`, `bool`, `str`, `bytes`, `tuple`, `frozenset`, `None`, `range` | `list`, `dict`, `set`, `bytearray`, most user-defined objects |

"Immutable" means the object cannot change. It does not mean the name cannot be rebound. `s += "x"` on a string builds a **new** string and rebinds `s`. `items += [x]` on a list mutates the **same** list in place, because `list.__iadd__` extends it.

```python
s = "ab"
before = id(s)
s += "c"
assert id(s) != before       # new string object

items = [1]
before = id(items)
items += [2]
assert id(items) == before   # same list, extended in place

# A tuple is immutable, but it can hold mutable objects
t = ([1, 2], "x")
t[0].append(3)
assert t == ([1, 2, 3], "x")
```

## Identity versus equality

- `==` calls `__eq__` and asks **"same value?"**
- `is` compares identity and asks **"same object?"** It cannot be overridden, and it is fast.

Use `is` only for singletons: `None`, `True`, `False`, and sentinel objects you create yourself. Use `==` for everything else.

```python
a = [1, 2]
b = [1, 2]
assert a == b and a is not b

x = None
assert x is None          # the idiomatic None check

# Small-integer caching is a CPython detail: never rely on it
n1, n2 = int("100"), int("100")
m1, m2 = int("257"), int("257")
assert n1 is n2           # CPython caches -5..256
assert m1 is not m2       # outside the cache: two different objects
assert m1 == m2           # == is always the right comparison
```

**Interning.** CPython also reuses some strings, such as identifier-like literals in compiled code. `sys.intern()` forces it. This is an optimisation for dictionary lookups, not something to depend on.

## Copying: assignment, shallow copy, deep copy

| Operation | New outer object? | New inner objects? |
|---|---|---|
| `b = a` | No | No |
| `copy.copy(a)`, `a[:]`, `list(a)`, `a.copy()`, `dict(a)` | Yes | No (inner objects are shared) |
| `copy.deepcopy(a)` | Yes | Yes, recursively (handles cycles via a memo dict) |

```python
import copy

patient = {"name": "Ana", "allergies": ["penicillin"]}

shallow = copy.copy(patient)
shallow["allergies"].append("latex")          # shared inner list
assert patient["allergies"] == ["penicillin", "latex"]

deep = copy.deepcopy(patient)
deep["allergies"].append("nuts")              # fully independent
assert "nuts" not in patient["allergies"]

# The grid trap: [[0] * 3] * 3 repeats the SAME inner list three times
bad = [[0] * 3] * 3
bad[0][0] = 1
assert bad == [[1, 0, 0], [1, 0, 0], [1, 0, 0]]
good = [[0] * 3 for _ in range(3)]
good[0][0] = 1
assert good == [[1, 0, 0], [0, 0, 0], [0, 0, 0]]
```

## Hashing and the `__eq__` / `__hash__` contract

A dict or set finds an item by its **hash**, then confirms the match with `==`. That only works if:

1. Objects that compare equal **must** have equal hashes.
2. The hash must not change while the object is in a dict or set. In practice, only immutable values should be hashable.

That is why `list`, `dict` and `set` are unhashable, while `tuple` and `frozenset` are hashable if their contents are. If a class defines `__eq__` without `__hash__`, Python sets `__hash__ = None`, which makes instances unhashable. This is a safety net against breaking rule 1.

```python
class PatientId:
    def __init__(self, mrn: str):
        self.mrn = mrn
    def __eq__(self, other: object) -> bool:
        return isinstance(other, PatientId) and self.mrn == other.mrn
    def __hash__(self) -> int:
        return hash(self.mrn)          # hash exactly what __eq__ compares

assert len({PatientId("A1"), PatientId("A1"), PatientId("B2")}) == 2

class OnlyEq:
    def __eq__(self, other: object) -> bool:
        return True

assert OnlyEq.__hash__ is None          # defining __eq__ removed the default hash
try:
    {OnlyEq()}
    raise AssertionError("should not be hashable")
except TypeError:
    pass

try:
    hash(([1], 2))                      # a tuple is only hashable if its items are
    raise AssertionError
except TypeError:
    pass
```

## Memory management

CPython manages memory in two layers:

1. **Reference counting.** Every object counts the references to it. When the count drops to zero, the object is freed immediately. This makes cleanup predictable, for example a file closing as soon as the last reference goes.
2. **A cyclic garbage collector.** Reference counting cannot free cycles, such as two objects pointing at each other. The `gc` module periodically finds unreachable groups and frees them. Its generational design looks at young objects most often.

```python
import gc
import weakref

class Node:
    def __init__(self) -> None:
        self.other: "Node | None" = None

a, b = Node(), Node()
a.other, b.other = b, a          # a reference cycle
watch = weakref.ref(a)           # a weak reference does not keep a alive
del a, b
gc.collect()                     # refcounts never hit zero; the cycle collector frees them
assert watch() is None
```

Other points worth knowing:

- `sys.getsizeof()` is **shallow**. It measures the container, not the objects it points to.
- `del x` deletes a **name**, not an object. The object is freed only when no references remain.
- To keep memory down, use generators instead of lists, `__slots__` on classes with millions of instances, `array` or NumPy for numbers, and `weakref` for caches.
- `__del__` is unreliable for cleanup. Use `with` (context managers) instead.

## Truthiness, numbers and floats

**Falsy values:** `None`, `False`, `0`, `0.0`, `0j`, `""`, `[]`, `{}`, `set()`, `range(0)`, and objects whose `__bool__` returns False (or, failing that, whose `__len__` returns 0). Everything else is truthy.

**Integers have arbitrary precision.** They never overflow. Two limits still apply: converting a huge int to `str` is capped at 4300 digits by default (a denial-of-service guard), and NumPy integers *are* fixed width and can overflow.

**Floats are IEEE 754 doubles.** `0.1 + 0.2 != 0.3`. Compare floats with `math.isclose`. Use `decimal.Decimal` (built from strings) for money, and `fractions.Fraction` for exact ratios. `round()` uses banker's rounding: `round(2.5) == 2`.

```python
import math
from decimal import Decimal

assert 0.1 + 0.2 != 0.3
assert math.isclose(0.1 + 0.2, 0.3)
assert Decimal("0.1") + Decimal("0.2") == Decimal("0.3")
assert Decimal(0.1) != Decimal("0.1")       # built from a float, it keeps the float error
assert round(2.5) == 2 and round(3.5) == 4  # round half to even
assert 2 ** 100 == 1267650600228229401496703205376   # no overflow
assert 7 // 2 == 3 and -7 // 2 == -4        # floor division rounds toward minus infinity
assert -7 % 2 == 1                          # result takes the sign of the divisor
```

## What changed in recent Python versions

Interviewers like asking "what's new in Python?" Have two or three of these ready.

| Version | Highlights |
|---|---|
| 3.8 | Walrus operator `:=`, positional-only parameters `/`, `f"{x=}"` debugging |
| 3.9 | Dict merge `a \| b`, built-in generics `list[int]`, `str.removeprefix` |
| 3.10 | Structural pattern matching `match`/`case`, `X \| Y` union types, much better error messages |
| 3.11 | Faster CPython (about 25% faster on average), exception groups and `except*`, `asyncio.TaskGroup`, `tomllib` |
| 3.12 | Type parameter syntax `def first[T](xs: list[T]) -> T` and `type` aliases (PEP 695), more flexible f-strings, `itertools.batched` |
| 3.13 | Experimental free-threaded build without the GIL (PEP 703), experimental JIT, new interactive REPL |
| 3.14 | Free-threaded build officially supported (still a separate build), template strings `t"..."` (PEP 750), deferred evaluation of annotations (PEP 649), `concurrent.interpreters`, `compression.zstd`, `except A, B:` without brackets |

```python
# Verified on the lab's Python 3.14
from string.templatelib import Template

name = "Ana"
tmpl = t"Hello {name}"            # a Template object, not a str
assert isinstance(tmpl, Template)
assert tmpl.strings == ("Hello ", "") and tmpl.interpolations[0].value == "Ana"

def first[T](xs: list[T]) -> T:   # PEP 695 generics (3.12+)
    return xs[0]
assert first([3, 4]) == 3

if (n := len([1, 2, 3])) > 2:     # walrus (3.8+)
    assert n == 3

match {"resourceType": "Patient", "id": "p1"}:   # pattern matching (3.10+)
    case {"resourceType": "Patient", "id": pid}:
        assert pid == "p1"
```

## Interview questions

### What is the difference between `is` and `==`? {core}

`==` compares **values**: it calls `__eq__`, so two separate lists with the same items are equal. `is` compares **identity**: are these two names bound to the very same object? `is` can't be overridden and is used for singletons like `None`. So I write `if x is None`, and `==` everywhere else.

A common follow-up asks why `a is b` is sometimes True for equal integers. CPython caches small integers from −5 to 256, and the compiler may reuse equal constants. That's an implementation detail, so code must never rely on it.

### Is Python pass-by-value or pass-by-reference? {core}

Neither. It's **pass by object reference** (pass by assignment). The function parameter becomes a new name bound to the same object the caller passed. If the function **mutates** that object, such as appending to a list, the caller sees it. If it **rebinds** the parameter (`items = []`), only the local name changes.

That's why passing an `int` or `str` behaves "like by value" (they're immutable, so they can only be rebound), and passing a `list` or `dict` behaves "like by reference".

### Which built-in types are mutable and which are immutable? Why does it matter? {core}

Immutable: `int`, `float`, `bool`, `str`, `bytes`, `tuple`, `frozenset`, `None`. Mutable: `list`, `dict`, `set`, `bytearray`, and most custom objects.

It matters for three reasons:

- **Hashing:** only immutable values can safely be dict keys or set members.
- **Aliasing bugs:** two names sharing a mutable object see each other's changes.
- **Thread safety:** immutable data can be shared without locks.

### Why is a mutable default argument a bug? How do you fix it? {core}

Default values are evaluated **once, when the `def` statement runs**, not on each call. A default `[]` is therefore one list shared by every call that doesn't pass the argument, and it keeps growing. Fix it with a `None` sentinel and create the list inside the function.

```python
def add_bad(item: str, bucket: list[str] = []) -> list[str]:
    bucket.append(item)
    return bucket

assert add_bad("a") == ["a"]
assert add_bad("b") == ["a", "b"]      # surprise: same list as last call

def add_good(item: str, bucket: list[str] | None = None) -> list[str]:
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket

assert add_good("a") == ["a"]
assert add_good("b") == ["b"]
```

The same "evaluated once" rule explains `def log(ts=datetime.now())`: the timestamp freezes at import time.

### Explain shallow copy versus deep copy. {core}

A **shallow copy** creates a new outer container, but the elements are the same objects as in the original. `list(a)`, `a[:]`, `a.copy()` and `copy.copy(a)` are all shallow. A **deep copy** (`copy.deepcopy`) recursively copies every nested object, so the two structures share nothing. It uses a memo dictionary, so cycles and shared references are handled.

Use a shallow copy for a flat list of immutable items. Use a deep copy for nested mutable data, such as a config dict you're about to modify per tenant. Deep copy is slower and copies everything, so use it deliberately. Classes can customise it with `__copy__` and `__deepcopy__`.

### Why does `[[0] * 3] * 3` give surprising results?

Multiplying a list repeats **references**, not copies. The outer list holds the same inner list three times, so setting `grid[0][0] = 1` shows up in every row. Build it with a comprehension, `[[0] * 3 for _ in range(3)]`, which creates a fresh inner list per row. `[0] * 3` alone is fine, because ints are immutable.

### What makes an object hashable? What is the contract between `__eq__` and `__hash__`? {core}

An object is hashable if it has a `__hash__` that never changes during its lifetime and an `__eq__` to compare with. The contract says **if `a == b`, then `hash(a) == hash(b)`**. The reverse isn't required, because collisions are allowed.

So you hash exactly the fields you compare. If you define `__eq__` without `__hash__`, Python sets `__hash__` to `None` and instances become unhashable. That protects you from objects that are equal but land in different hash buckets. Mutable objects shouldn't be hashable, because changing a field after insertion would leave the object stored in the wrong bucket. A `@dataclass(frozen=True)` gives you both methods correctly.

### Can a tuple be a dictionary key? Always?

Only if every element is hashable. `(1, "a")` works. `([1], 2)` raises `TypeError: unhashable type: 'list'`, because a tuple's hash is computed from its items. The same rule applies to `frozenset`.

### How does Python manage memory? {core}

CPython uses **reference counting** as the main mechanism. Each object tracks how many references point to it, and it's freed the moment the count hits zero, which makes cleanup deterministic. Reference counting can't reclaim **cycles**, so there's also a **generational cyclic garbage collector** in the `gc` module. It periodically looks for groups of objects that only reference each other, and it checks young objects more often than old ones.

On top of that, CPython's `pymalloc` allocator pools small objects for speed. Practical consequences: `del` removes a name, not an object. Memory used by a long-lived process may not return to the OS immediately. Leaks usually come from references you forgot about, like global caches, closures or listeners, not from the collector.

### What does `del` do?

`del x` removes the **name** `x` from the current namespace and decrements the object's reference count. The object is destroyed only if that was the last reference. `del items[0]` and `del d["k"]` remove an element from a container, which is a different operation (`__delitem__`). Don't use `__del__` for cleanup: when it runs is not guaranteed. Use a context manager instead.

### Why is `0.1 + 0.2 != 0.3`, and how do you handle money?

Floats are binary IEEE 754 doubles, and 0.1 has no exact binary representation, so tiny rounding errors appear. Compare floats with `math.isclose()`. For money, use `decimal.Decimal` constructed from **strings**, or store integer cents. In healthcare billing (claim amounts, copays), integer cents or `Decimal` are standard. Floats are not acceptable for that.

### Can Python integers overflow?

No. `int` has arbitrary precision and grows as needed (`2 ** 1000` is fine). Two caveats: in current versions (3.11+, also backported to older security releases), converting an int with more than 4300 digits to a `str` raises `ValueError` by default, as a guard against denial-of-service attacks (adjustable with `sys.set_int_max_str_digits`). And **NumPy and pandas integers are fixed width** (`int64`), so they *can* overflow silently. That matters in data pipelines.

### What is truthiness? What does `if items:` check? {core}

Every object has a truth value. `if items:` calls `items.__bool__()`, or `__len__()` if there's no `__bool__`. So it is False for `None`, `0`, `0.0`, empty strings and empty containers, and True otherwise. It's the idiomatic way to test emptiness.

The trap: `if not value:` treats `0` and `""` the same as `None`. When `0` is a valid value, such as a lab result of 0, write `if value is None:` explicitly.

### Why does `t[0] += [1]` raise an error but still change the tuple's list? {deep}

`t[0] += [1]` runs in two steps. First, `list.__iadd__` extends the list **in place**, which succeeds because the list is mutable. Then Python tries to assign the result back with `t[0] = ...`, which fails because tuples don't support item assignment. So you get a `TypeError`, *and* the list has changed. It's a good illustration that `+=` means "in-place operation, then rebind".

### What is the difference between `a = a + b` and `a += b` for lists? {deep}

`a + b` builds a **new** list and rebinds `a`, so other names pointing at the old list don't see the change. `a += b` calls `__iadd__`, which **extends the existing list in place**, so every alias sees it. For immutable types like `str` or `tuple`, there's no `__iadd__`, so both forms create a new object. `+=` on a list also accepts any iterable (`a += "xy"` adds two characters), while `a + "xy"` raises `TypeError`.

### What is string interning? {deep}

Interning means keeping one shared copy of equal strings, so comparisons and dict lookups can short-circuit on identity. CPython automatically interns many compile-time strings, such as identifier-like literals, attribute names and dict keys in code. `sys.intern(s)` interns any string explicitly, which can save memory when you hold millions of repeated keys, like codes parsed from a large file. Never write `s is "abc"`: it's unreliable, and modern Python emits a `SyntaxWarning` for it.

### What is a weak reference, and when would you use one? {deep}

A `weakref.ref(obj)` points to an object **without increasing its reference count**. When the object is collected, the weak reference returns `None`. Typical uses are caches and registries that shouldn't keep objects alive (`weakref.WeakValueDictionary`), and observer lists that shouldn't leak listeners. Not every type supports weak references, notably `int`, `str` and `tuple`.

### What's new in recent Python versions that you actually use? {core}

Pick features you can talk about from experience:

- **Pattern matching** (3.10) for routing different document or message shapes.
- **`X | None` type hints** (3.10) and **built-in generics** `list[str]` (3.9).
- **Exception groups and `TaskGroup`** (3.11) for structured async concurrency.
- **PEP 695 generics** `def f[T](...)` (3.12).

Then show you follow the language. 3.13 shipped an experimental **free-threaded (no-GIL) build**, which **3.14** made officially supported, though it's still an optional separate build. 3.14 also added **template strings** (`t"..."`, which return a `Template` so you can safely escape interpolations, for example in SQL or HTML) and **deferred evaluation of annotations**.

**Your angle:** the Document AI backend used FastAPI with Pydantic models and modern type hints (`X | None`, built-in generics) throughout.

### What does `__slots__` do to memory? {deep}

By default, each instance stores its attributes in a per-instance `__dict__`, which is flexible but costs memory. Declaring `__slots__ = ("a", "b")` replaces the dict with fixed slots. You get noticeably less memory per instance and slightly faster attribute access, but you can't add new attributes. It's useful when you create millions of small objects. `@dataclass(slots=True)` (3.10+) generates it for you. The OOP chapter covers it in more detail.
