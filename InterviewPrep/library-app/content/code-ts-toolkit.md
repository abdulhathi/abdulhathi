---
title: JavaScript and TypeScript toolkit for live coding
goal: Write correct, idiomatic TypeScript fast under pressure, dodge the classic JavaScript traps, and clear the warm-up problems without hesitation.
minutes: 60
---

For a front-end-heavy full-stack role, the live coding round is most likely in JavaScript or TypeScript, often in a
shared editor with no autocomplete. Interviewers watch for fluency: reaching for `Map`, `Set`, `flatMap` and a proper
sort comparator, and knowing what each costs. They also probe the language itself: `this`, closures, coercion and the
event loop. A senior candidate who trips on `[10, 9, 1].sort()` loses points that have nothing to do with algorithms.

This chapter is the toolkit: the idioms worth having in your fingers, the costs, the traps interviewers ask about, and
fourteen warm-up problems. Every block runs under Node with `node:assert/strict`. Write type annotations on function
signatures in the interview too: it shows intent and costs seconds.

## The idioms that save you minutes

### Arrays and what they cost

| Operation | Cost | Note |
|---|---|---|
| `push`, `pop`, `arr[i]`, `arr.length` | O(1) | the fast end of an array is the back |
| `shift`, `unshift`, `splice` in the middle | O(n) | every later element moves; use an index pointer or a deque instead |
| `indexOf`, `includes`, `find`, `some` | O(n) | for repeated lookups build a `Set` or `Map` first |
| `slice`, spread `[...a]`, `concat` | O(k) / O(n) | copies; fine once, costly inside a loop |
| `sort` | O(n log n) | sorts **in place** and compares as **strings** by default |
| `map`, `filter`, `reduce`, `flatMap` | O(n) | each allocates a new array (except `reduce`) |

```ts
import assert from 'node:assert/strict';

const runs = [
  { id: 'r1', status: 'done', ms: 1200 },
  { id: 'r2', status: 'failed', ms: 300 },
  { id: 'r3', status: 'done', ms: 800 },
];

assert.deepEqual(runs.filter((r) => r.status === 'done').map((r) => r.id), ['r1', 'r3']);
assert.equal(runs.reduce((sum, r) => sum + r.ms, 0), 2300);
assert.equal(runs.some((r) => r.status === 'failed'), true);
assert.equal(runs.every((r) => r.ms > 100), true);
assert.equal(runs.find((r) => r.ms < 500)?.id, 'r2');
assert.equal(runs.findIndex((r) => r.id === 'nope'), -1);

// flatMap = map then flatten one level; returning [] drops an item.
assert.deepEqual([1, 2, 3].flatMap((n) => (n % 2 ? [n, n] : [])), [1, 1, 3, 3]);

// at() reads from the end with negative indexes.
assert.equal([10, 20, 30].at(-1), 30);

// Build arrays without a loop. Array.from takes a map function.
assert.deepEqual(Array.from({ length: 4 }, (_, i) => i * i), [0, 1, 4, 9]);

// Trap: fill() with an object shares ONE object across every slot.
const shared = new Array(3).fill([]);
shared[0].push('x');
assert.deepEqual(shared, [['x'], ['x'], ['x']]);
const grid = Array.from({ length: 3 }, () => [] as string[]);
grid[0].push('x');
assert.deepEqual(grid, [['x'], [], []]);
```

### Sorting correctly

```ts
import assert from 'node:assert/strict';

// Default sort converts to strings and compares UTF-16 code units.
assert.deepEqual([10, 9, 1, 100].sort(), [1, 10, 100, 9]);
// Numbers need a comparator: negative = a first, positive = b first, 0 = keep order.
assert.deepEqual([10, 9, 1, 100].sort((a, b) => a - b), [1, 9, 10, 100]);

// sort() mutates. toSorted() (ES2023) returns a sorted copy; [...a].sort() is the older equivalent.
const original = [3, 1, 2];
const sorted = original.toSorted((a, b) => a - b);
assert.deepEqual(original, [3, 1, 2]);
assert.deepEqual(sorted, [1, 2, 3]);
assert.deepEqual([...original].sort((a, b) => a - b), sorted);

// Multi-key: by priority descending, then name ascending. Sort is stable (guaranteed since ES2019).
const tasks = [
  { name: 'b', priority: 1 },
  { name: 'a', priority: 2 },
  { name: 'c', priority: 2 },
];
tasks.sort((x, y) => y.priority - x.priority || x.name.localeCompare(y.name));
assert.deepEqual(tasks.map((t) => t.name), ['a', 'c', 'b']);
```

### The newer built-ins worth using

Current browsers and Node 22+ ship a set of newer helpers that make interview code shorter and safer. TypeScript only
knows them when `lib` (or `target`) is new enough: ES2023 for the non-mutating array methods, ES2024 for grouping,
ES2025 for Set methods and iterator helpers. Use them by default, but if the interviewer says "no built-ins" or the
editor targets an old runtime, be ready to write the hand-made version, which the problems below also show.

```ts
import assert from 'node:assert/strict';

const steps = [
  { name: 'plan', status: 'done', ms: 40 },
  { name: 'search', status: 'failed', ms: 900 },
  { name: 'answer', status: 'done', ms: 300 },
];

// ES2023: copies instead of mutating (handy for React state).
assert.deepEqual(steps.toSorted((a, b) => b.ms - a.ms).map((s) => s.name), ['search', 'answer', 'plan']);
assert.deepEqual([1, 2, 3].toReversed(), [3, 2, 1]);
assert.deepEqual([1, 2, 3].with(1, 20), [1, 20, 3]);
assert.equal(steps.findLast((s) => s.status === 'done')?.name, 'answer');

// ES2024: grouping. Object.groupBy returns a null-prototype object, so keys like "__proto__" are safe;
// spread it into a plain object before a strict structural comparison.
const byStatus = Object.groupBy(steps, (s) => s.status);
assert.deepEqual({ ...byStatus }, { done: [steps[0], steps[2]], failed: [steps[1]] });
assert.equal(Object.getPrototypeOf(byStatus), null);
const slowFast = Map.groupBy(steps, (s) => (s.ms > 100 ? 'slow' : 'fast'));
assert.deepEqual(slowFast.get('slow')?.map((s) => s.name), ['search', 'answer']);

// ES2024: a promise with its resolve and reject exposed (the "deferred" pattern used in queues).
const { promise, resolve } = Promise.withResolvers<string>();
resolve('ready');
assert.equal(await promise, 'ready');

// ES2025: Set algebra.
const granted = new Set(['read', 'write']);
const required = new Set(['read', 'approve']);
assert.deepEqual([...required.difference(granted)], ['approve']);
assert.deepEqual([...granted.intersection(required)], ['read']);
assert.equal(new Set(['read']).isSubsetOf(granted), true);

// ES2025: iterator helpers are lazy, so they work on infinite generators.
function* ids(): Generator<number> {
  for (let i = 1; ; i++) yield i;
}
assert.deepEqual(ids().filter((n) => n % 2 === 0).map((n) => `run-${n}`).take(3).toArray(), ['run-2', 'run-4', 'run-6']);
```

### Map and Set instead of plain objects

```ts
import assert from 'node:assert/strict';

// Count with a Map: any key type, insertion order kept, O(1) average get/set, .size is free.
const words = ['retry', 'ok', 'retry', 'timeout', 'retry'];
const counts = new Map<string, number>();
for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
assert.deepEqual([...counts], [['retry', 3], ['ok', 1], ['timeout', 1]]);

// The most frequent entry.
const [top] = [...counts].sort((a, b) => b[1] - a[1]);
assert.deepEqual(top, ['retry', 3]);

// Dedupe while keeping first-seen order.
assert.deepEqual([...new Set([3, 1, 3, 2, 1])], [3, 1, 2]);

// Set membership is O(1); array.includes is O(n).
const allowed = new Set(['read', 'write']);
assert.equal(allowed.has('write'), true);

// Objects coerce keys to strings, so 1 and '1' collide. Maps keep them apart.
const obj: Record<string, string> = {};
obj[1 as unknown as string] = 'number';
obj['1'] = 'string';
assert.equal(Object.keys(obj).length, 1);
const map = new Map<unknown, string>([[1, 'number'], ['1', 'string']]);
assert.equal(map.size, 2);

// Object.entries / fromEntries convert between the two worlds.
assert.deepEqual(Object.fromEntries(counts), { retry: 3, ok: 1, timeout: 1 });
```

Use a plain object (or `Record<K, V>`) for a fixed shape such as a JSON payload. Use a `Map` for a dictionary that grows
at runtime, has non-string keys, or needs fast deletes and ordered iteration.

### Strings

```ts
import assert from 'node:assert/strict';

const s = '  Agent run FAILED  ';
assert.equal(s.trim().toLowerCase(), 'agent run failed');
assert.deepEqual('a,b,,c'.split(','), ['a', 'b', '', 'c']);
assert.deepEqual('  many   spaces '.trim().split(/\s+/), ['many', 'spaces']);
assert.equal('ab'.repeat(3), 'ababab');
assert.equal('7'.padStart(3, '0'), '007');
assert.equal('a-b-c'.replaceAll('-', '_'), 'a_b_c');
assert.equal('step'.startsWith('st') && 'step'.endsWith('ep'), true);

// Character codes: handy for "a" → 0 ... "z" → 25 counting arrays.
assert.equal('c'.charCodeAt(0) - 'a'.charCodeAt(0), 2);
assert.equal(String.fromCharCode(97 + 25), 'z');

// Strings are immutable. Reverse via an array.
assert.equal([...'abc'].reverse().join(''), 'cba');

// Indexing works on UTF-16 code units, so emoji are two "characters". Spread and for...of iterate code points.
const e = 'ok👍';
assert.equal(e.length, 4);
assert.equal([...e].length, 3);
```

Building a long string with `+=` in a loop is fine in modern engines (they use ropes). Collecting parts in an array and
calling `join` is also fine, and clearer when you need a separator.

### Numbers

```ts
import assert from 'node:assert/strict';

assert.notEqual(0.1 + 0.2, 0.3); // binary floating point
assert.ok(Math.abs(0.1 + 0.2 - 0.3) < Number.EPSILON);

// Integer division: Math.trunc rounds toward zero; Math.floor rounds down (differs for negatives).
assert.equal(Math.trunc(-7 / 2), -3);
assert.equal(Math.floor(-7 / 2), -4);
// % keeps the sign of the dividend. A true modulo for negatives:
assert.equal(-7 % 3, -1);
assert.equal(((-7 % 3) + 3) % 3, 2);

// Safe integers stop at 2^53 - 1. Use BigInt beyond that.
assert.equal(Number.MAX_SAFE_INTEGER, 2 ** 53 - 1);
assert.equal(2 ** 53 + 1 === 2 ** 53, true);
assert.equal(2n ** 64n, 18446744073709551616n);

// Parsing traps.
assert.equal(parseInt('08', 10), 8);
assert.equal(Number(''), 0); // empty string is 0, not NaN
assert.ok(Number.isNaN(Number('12px')));
assert.equal(parseInt('12px', 10), 12); // parseInt stops at the first bad character
assert.equal(Number.isInteger(5.0), true);

// NaN is the only value not equal to itself (TypeScript even flags a literal `x === NaN` as always false).
const notANumber: number = Number('abc');
assert.equal(notANumber === notANumber, false);
assert.equal(Number.isNaN(notANumber), true);
assert.equal(Object.is(notANumber, NaN), true);
```

### Objects, copies and missing values

```ts
import assert from 'node:assert/strict';

const run = { id: 'r1', config: { retries: 3 }, tags: ['nightly'] };

// Spread is a SHALLOW copy: nested objects are shared.
const shallow = { ...run };
shallow.config.retries = 5;
assert.equal(run.config.retries, 5);

// structuredClone is a deep copy (Maps, Sets, Dates, cycles OK; functions and class prototypes are not kept).
const deep = structuredClone(run);
deep.config.retries = 1;
assert.equal(run.config.retries, 5);

// ?? only falls back on null/undefined; || also replaces 0, '' and false.
const limit = 0;
assert.equal(limit ?? 10, 0);
assert.equal(limit || 10, 10);

// Optional chaining stops at null/undefined instead of throwing.
const maybe: { owner?: { name: string } } = {};
assert.equal(maybe.owner?.name, undefined);
assert.equal(maybe.owner?.name ?? 'unassigned', 'unassigned');

// Destructuring with defaults and renaming.
const { id: runId, missing = 'default' } = run as typeof run & { missing?: string };
assert.equal(runId, 'r1');
assert.equal(missing, 'default');
```

### Iterators and generators

```ts
import assert from 'node:assert/strict';

// A generator is a lazy sequence: values are produced only when asked for.
function* range(start: number, end: number, step = 1): Generator<number> {
  for (let i = start; i < end; i += step) yield i;
}
function* take<T>(it: Iterable<T>, n: number): Generator<T> {
  if (n <= 0) return;
  for (const x of it) {
    yield x;
    if (--n === 0) return;
  }
}
function* naturals(): Generator<number> {
  for (let i = 0; ; i++) yield i;
}

assert.deepEqual([...range(0, 10, 3)], [0, 3, 6, 9]);
assert.deepEqual([...take(naturals(), 3)], [0, 1, 2]); // infinite source, finite result

// Group by hand: what Object.groupBy / Map.groupBy do for you, and what to write if built-ins are off limits.
const byStatus = new Map<string, string[]>();
for (const [id, status] of [['r1', 'done'], ['r2', 'failed'], ['r3', 'done']] as const) {
  const list = byStatus.get(status) ?? [];
  list.push(id);
  byStatus.set(status, list);
}
assert.deepEqual(Object.fromEntries(byStatus), { done: ['r1', 'r3'], failed: ['r2'] });
```

## The traps interviewers probe

### Scope, closures and the classic loop

```ts
import assert from 'node:assert/strict';

// var is function-scoped: every callback shares one i, which is 3 by the time they run.
const withVar: (() => number)[] = [];
for (var i = 0; i < 3; i++) withVar.push(() => i);
assert.deepEqual(withVar.map((f) => f()), [3, 3, 3]);

// let creates a fresh binding per iteration.
const withLet: (() => number)[] = [];
for (let j = 0; j < 3; j++) withLet.push(() => j);
assert.deepEqual(withLet.map((f) => f()), [0, 1, 2]);

// A closure keeps private state alive.
function counter() {
  let n = 0;
  return { next: () => ++n, peek: () => n };
}
const c = counter();
c.next();
c.next();
assert.equal(c.peek(), 2);

// Temporal dead zone: let/const exist from the start of the block but cannot be read before the declaration.
assert.throws(() => {
  // @ts-expect-error reading before declaration is a ReferenceError at runtime
  const read = later;
  const later = 1;
  return read;
}, ReferenceError);
```

### `this`

```ts
import assert from 'node:assert/strict';

class Poller {
  count = 0;
  tick() {
    this.count++;
    return this.count;
  }
  // Arrow function property: `this` is bound lexically to the instance.
  tickArrow = () => ++this.count;
}

const p = new Poller();
const detached = p.tick; // calling it loses `this` (undefined in strict mode / class bodies)
assert.throws(() => detached(), TypeError);
assert.equal(p.tick.bind(p)(), 1);
const arrow = p.tickArrow;
assert.equal(arrow(), 2); // safe to pass as a callback, e.g. to setInterval or an event listener
```

### Equality and coercion

```ts
import assert from 'node:assert/strict';

const loose = (a: unknown, b: unknown) => (a as number) == (b as number);
assert.equal(loose(0, ''), true);
assert.equal(loose(null, undefined), true);
assert.equal(loose(null, 0), false);
assert.equal(loose('1', 1), true);
assert.equal(typeof null, 'object'); // a historical bug, kept forever
assert.equal(typeof [], 'object');
assert.equal(Array.isArray([]), true);
assert.equal([1, 2] + '', '1,2');
// Objects compare by reference.
assert.notEqual({ a: 1 } as object, { a: 1 } as object);
assert.deepEqual({ a: 1 }, { a: 1 }); // structural comparison needs a helper
```

Rule to state: always use `===`, except `x == null` as a deliberate check for both `null` and `undefined`.

### The event loop, in one block

```ts
import assert from 'node:assert/strict';

const order: string[] = [];
// Run the experiment inside a timer callback, like most real code (a request handler, a socket message).
await new Promise<void>((done) => {
  setTimeout(() => {
    setTimeout(() => {
      order.push('timeout (macrotask)');
      done();
    }, 0);
    Promise.resolve().then(() => order.push('promise (microtask)'));
    queueMicrotask(() => order.push('queueMicrotask (microtask)'));
    process.nextTick(() => order.push('nextTick (Node, before promises)'));
    order.push('sync');
  }, 0);
});
assert.deepEqual(order, [
  'sync',
  'nextTick (Node, before promises)',
  'promise (microtask)',
  'queueMicrotask (microtask)',
  'timeout (macrotask)',
]);
```

The rule: run the current synchronous code to the end, then drain **all** microtasks (promise callbacks,
`queueMicrotask`; in Node `process.nextTick` runs even before those), then take **one** macrotask (a timer, I/O, a
message), render if in a browser, and repeat. One Node detail worth knowing: in the top-level code of an ES module,
`nextTick` callbacks run *after* the promise callbacks, because evaluating the module is itself a promise job (in a
CommonJS file the order is the familiar one). The block above runs its experiment inside a timer callback for that
reason. The same rule explains why a long synchronous loop freezes the UI, and why an endless chain of microtasks can
starve rendering too.

## Interview questions

### What is the difference between `==` and `===`? {core}

`===` compares type and value with no conversion. `==` converts the operands first, which gives surprising results such
as `0 == ''` and `'1' == 1` being true. I use `===` everywhere. The one deliberate exception is `x == null`, which is
true for both `null` and `undefined`. For "same value" semantics including `NaN`, `Object.is` exists, and objects always
compare by reference, so structural equality needs a helper.

### Explain closures with a real example. {core}

A closure is a function together with the variables from the scope where it was created. The function can keep reading
and updating them after that scope has returned. I use them for private state (a counter or cache inside a factory),
for callbacks that need context (an event handler that knows which run it belongs to), and for function factories like
`debounce`, which keeps its timer id in a closure. The classic bug is a stale closure: a React effect or `setInterval`
callback that captured an old value. The fix is the right dependency list, a functional update or a ref.

### What is the difference between `var`, `let` and `const`? {core}

`var` is function-scoped, hoisted and initialised to `undefined`, and can be redeclared. `let` and `const` are
block-scoped and sit in the temporal dead zone until their declaration runs, so reading them early throws a
`ReferenceError`. `const` stops reassignment of the binding, not mutation of the object it points to. In practice I use
`const` by default, `let` when I must reassign, and never `var`. The `for (var i …)` closure bug is the standard example.

### How is `this` decided in JavaScript? {core}

By how a function is called, not where it is defined. A method call `obj.f()` sets `this` to `obj`. A plain call `f()`
gives `undefined` in strict mode (class bodies and modules are strict). `new` sets it to the new object. `call`,
`apply` and `bind` set it explicitly. Arrow functions have no `this` of their own and use the enclosing one, which is
why they are the right choice for callbacks inside classes. The bug to mention is passing `obj.method` as a callback and
losing `this`.

### Explain the event loop: microtasks vs macrotasks. {core}

JavaScript runs one call stack. When it empties, the engine drains the whole microtask queue (promise reactions,
`queueMicrotask`, and in Node `process.nextTick` first), then takes one macrotask such as a timer or I/O callback, then
the browser may render, and the cycle repeats. So `Promise.resolve().then(...)` always runs before
`setTimeout(..., 0)`. Long synchronous work blocks everything, including rendering and incoming WebSocket messages. The
fixes are chunking the work, yielding with `setTimeout` (or `scheduler.yield()` where the browser supports it), or
moving it to a Web Worker.

### What does `[10, 1, 3].sort()` return, and why?

`[1, 10, 3]`. Without a comparator, `sort` converts elements to strings and compares them as UTF-16 text, so `'10'` comes
before `'3'`. For numbers pass `(a, b) => a - b`. Also remember `sort` mutates the array in place, and it has been
guaranteed stable since ES2019, which makes multi-key sorts with `||` between comparisons safe.

### When do you use a Map instead of an object, and a Set instead of an array?

A `Map` for a runtime dictionary: keys of any type (objects, numbers without coercion), guaranteed insertion order, a
cheap `size`, fast deletes, and no prototype keys like `constructor` to collide with. An object for a fixed, known shape
such as a JSON payload or a typed record. A `Set` when I need uniqueness or O(1) membership tests; `array.includes`
is O(n), so a lookup inside a loop turns O(n) into O(n²).

### What is the difference between a shallow and a deep copy?

A shallow copy (`{...obj}`, `[...arr]`, `Object.assign`) duplicates the top level only; nested objects are still
shared, so mutating them changes the original. A deep copy duplicates everything: `structuredClone` does this natively,
handling Maps, Sets, Dates and cycles, but not functions, DOM nodes or class prototypes. `JSON.parse(JSON.stringify(x))`
is the old trick and loses `undefined`, Dates, Maps and anything non-JSON. In React state code, prefer immutable updates
that copy only the path you change.

### What is the difference between `null` and `undefined`, and between `??` and `||`?

`undefined` means "not set": a missing property, an unpassed argument, a function with no return. `null` is an explicit
"no value" that someone assigned. `??` falls back only for `null` or `undefined`, while `||` falls back for any falsy
value, including `0`, `''` and `false`. So `retries ?? 3` keeps a deliberate `0`, and `retries || 3` silently turns it
into 3, which is a real bug class.

### What is hoisting?

Declarations are processed before code runs. Function declarations are hoisted with their body, so you can call them
above where they are written. `var` declarations are hoisted and set to `undefined`. `let`, `const` and `class` are
hoisted too but stay uninitialised (the temporal dead zone) until their line runs. Function expressions and arrow
functions assigned to variables follow their variable's rules.

### How does prototypal inheritance relate to classes? {deep}

Every object has an internal link to a prototype object, and property lookups walk that chain. `class` is syntax over
this: methods live on `Class.prototype`, `extends` links one prototype to another, and `super` calls up the chain.
Differences from the old function style: class bodies are strict mode, classes are not callable without `new`, and they
support private `#fields` with real runtime privacy, unlike TypeScript's compile-time `private`.

### Why does the order of `await` matter for performance? {core}

Each `await` pauses the function until that promise settles. Awaiting two independent calls one after the other makes
the total time the sum of both. Starting both first and then awaiting `Promise.all([a, b])` makes it the maximum. So I
start independent work early and await together, but keep sequential awaits when the second call needs the first
result, or when I deliberately want to limit load on an API. The [async chapter](#/code-async) has concurrency limiters
for the in-between case.

## Coding problems

### FizzBuzz, returning an array {easy}

Return the strings for 1 to n: multiples of 3 become `"Fizz"`, of 5 `"Buzz"`, of both `"FizzBuzz"`, otherwise the
number as a string. `fizzBuzz(5)` → `["1", "2", "Fizz", "4", "Buzz"]`.

#### Hints

1. Check the "both" case first, or build the string from parts.
2. Building parts avoids the ordering problem: append "Fizz" and "Buzz" separately, then fall back to the number.

#### Solution

Concatenating the parts handles 15 without a special case and extends cleanly if they add "7 → Bazz".

```ts
import assert from 'node:assert/strict';

function fizzBuzz(n: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const word = (i % 3 === 0 ? 'Fizz' : '') + (i % 5 === 0 ? 'Buzz' : '');
    out.push(word || String(i));
  }
  return out;
}

assert.deepEqual(fizzBuzz(5), ['1', '2', 'Fizz', '4', 'Buzz']);
assert.equal(fizzBuzz(15)[14], 'FizzBuzz');
assert.deepEqual(fizzBuzz(0), []);
```

Complexity: O(n) time and O(n) output.

#### Follow-ups

- **Make the rules configurable.** Take `[[3, 'Fizz'], [5, 'Buzz']]` and loop over the rules.
- **Stream it instead of building an array.** Use a generator that yields one string at a time.

### Reverse the words in a sentence {easy core}

Reverse the order of words. Words are separated by one or more spaces, and the result has single spaces with no leading
or trailing space. `"  agent   run  failed "` → `"failed run agent"`.

#### Hints

1. Trim first, then split on a run of whitespace with a regular expression.
2. `split(/\s+/)` on an empty string gives `['']`, so handle empty input.

#### Solution

Trim, split on `/\s+/`, reverse, join. The only edge case is an all-space or empty input, which should return `''`.

```ts
import assert from 'node:assert/strict';

function reverseWords(s: string): string {
  const trimmed = s.trim();
  if (trimmed === '') return '';
  return trimmed.split(/\s+/).reverse().join(' ');
}

assert.equal(reverseWords('  agent   run  failed '), 'failed run agent');
assert.equal(reverseWords('one'), 'one');
assert.equal(reverseWords('   '), '');
assert.equal(reverseWords(''), '');
```

Complexity: O(n) time and O(n) extra space.

#### Follow-ups

- **Do it in place on a character array.** Reverse the whole array, then reverse each word: O(1) extra space.
- **Keep punctuation attached to its word?** Splitting on whitespace already does.

### Valid palindrome, ignoring punctuation and case {easy core}

Return true if the string reads the same forwards and backwards, considering only letters and digits and ignoring
case. `"A man, a plan, a canal: Panama"` → true; `"run, nur!"` → true; `"agent"` → false.

#### Hints

1. You could clean the string and compare it with its reverse: O(n) extra space.
2. Two pointers from both ends avoid the copy: skip characters that are not alphanumeric.

#### Solution

The cleaned-copy version is a fine first answer. The two-pointer version shows you can do it in O(1) extra space: move
the left and right pointers inward, skipping non-alphanumeric characters, and compare lower-cased characters.

```ts
import assert from 'node:assert/strict';

const isAlnum = (ch: string) => /[a-z0-9]/i.test(ch);

function isPalindrome(s: string): boolean {
  let left = 0;
  let right = s.length - 1;
  while (left < right) {
    if (!isAlnum(s[left])) left++;
    else if (!isAlnum(s[right])) right--;
    else if (s[left].toLowerCase() !== s[right].toLowerCase()) return false;
    else {
      left++;
      right--;
    }
  }
  return true;
}

assert.equal(isPalindrome('A man, a plan, a canal: Panama'), true);
assert.equal(isPalindrome('run, nur!'), true);
assert.equal(isPalindrome('agent'), false);
assert.equal(isPalindrome(''), true);
assert.equal(isPalindrome('.,'), true);
assert.equal(isPalindrome('0P'), false);
```

Complexity: O(n) time, O(1) extra space.

#### Follow-ups

- **Allow deleting at most one character.** On the first mismatch, check whether skipping the left or the right
  character leaves a palindrome.
- **Unicode letters?** Use `/[\p{L}\p{N}]/u` instead of `[a-z0-9]`.

### First non-repeating character {easy core}

Return the index of the first character that appears exactly once, or -1. `"streaming"` → 0 (`s`); `"aabb"` → -1;
`"leetcode"` → 0.

#### Hints

1. Checking every character against every other is O(n²).
2. Count first in one pass, then find the first count of 1 in a second pass.

#### Solution

Two passes with a `Map` of counts, which works for any alphabet, not just a–z. Iterate the **same units** in both
passes: here `Array.from(s)` splits into code points, so an emoji counts as one character. (Mixing `for...of`, which
yields code points, with `s[i]`, which reads UTF-16 code units, is a quiet bug: the halves of an emoji are never found
in the map.)

```ts
import assert from 'node:assert/strict';

function firstUniqueIndex(s: string): number {
  const chars = Array.from(s); // code points
  const counts = new Map<string, number>();
  for (const ch of chars) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  return chars.findIndex((ch) => counts.get(ch) === 1);
}

assert.equal(firstUniqueIndex('streaming'), 0);
assert.equal(firstUniqueIndex('loveleetcode'), 2);
assert.equal(firstUniqueIndex('aabb'), -1);
assert.equal(firstUniqueIndex(''), -1);
assert.equal(firstUniqueIndex('👍a👍'), 1); // index counted in characters (code points)
```

Complexity: O(n) time; O(n) space for the character array and the counts. For ASCII-only input, say so and loop
over `s[i]` in both passes to skip the copy.

#### Follow-ups

- **The characters arrive as a stream; answer after each one.** Keep counts plus a queue of candidates, and pop from the
  front while the front's count is above 1.

### Valid anagram {easy}

Return true if two strings contain the same characters with the same counts. `("listen", "silent")` → true.

#### Hints

1. Sorting both strings works in O(n log n).
2. One count map: add for the first string, subtract for the second, and check everything is zero.

#### Solution

Different lengths fail immediately. Then one `Map`: increment for `a`, decrement for `b`, and return false as soon as a
count would go negative.

```ts
import assert from 'node:assert/strict';

function isAnagram(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const ch of a) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  for (const ch of b) {
    const left = (counts.get(ch) ?? 0) - 1;
    if (left < 0) return false;
    counts.set(ch, left);
  }
  return true;
}

assert.equal(isAnagram('listen', 'silent'), true);
assert.equal(isAnagram('rat', 'car'), false);
assert.equal(isAnagram('', ''), true);
assert.equal(isAnagram('aab', 'abb'), false);
```

Complexity: O(n) time, O(k) space.

#### Follow-ups

- **Group a list of words into anagram groups.** Key a `Map` by the sorted word or by a 26-count signature.

### Dedupe records by key, keeping the first {easy core}

Given events that may be delivered twice, keep the first occurrence of each `id`, in the original order.

```text
[{id: 'e1', v: 1}, {id: 'e2', v: 2}, {id: 'e1', v: 9}] → [{id: 'e1', v: 1}, {id: 'e2', v: 2}]
```

#### Hints

1. A `Set` of seen ids gives O(1) membership checks.
2. Make it generic: accept a function that extracts the key.

#### Solution

One pass with a `Set`. Generic over the record type and key type, which is how you would write the helper for real.

```ts
import assert from 'node:assert/strict';

function uniqueBy<T, K>(items: readonly T[], key: (item: T) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

const events = [
  { id: 'e1', v: 1 },
  { id: 'e2', v: 2 },
  { id: 'e1', v: 9 },
];
assert.deepEqual(uniqueBy(events, (e) => e.id), [
  { id: 'e1', v: 1 },
  { id: 'e2', v: 2 },
]);
assert.deepEqual(uniqueBy([], (x: number) => x), []);
assert.deepEqual(uniqueBy(['A', 'a', 'b'], (s) => s.toLowerCase()), ['A', 'b']);
```

Complexity: O(n) time and space.

#### Follow-ups

- **Keep the last occurrence instead.** Write into a `Map` keyed by id (later writes win), or walk backwards.
- **The stream is unbounded.** Keep only recent ids, for example a time-windowed set or an LRU, and say that
  deduplication is then best effort. See [task queues](#/task-queues) for idempotency keys.

### Chunk an array {easy}

Split an array into chunks of size n; the last chunk may be shorter. `chunk([1,2,3,4,5], 2)` → `[[1,2],[3,4],[5]]`.
Throw for a size below 1.

#### Hints

1. Step through the array `size` at a time with `slice`.
2. Validate the size first; an infinite loop on size 0 is the classic bug.

#### Solution

```ts
import assert from 'node:assert/strict';

function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('size must be a positive integer');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
assert.deepEqual(chunk([1, 2], 5), [[1, 2]]);
assert.deepEqual(chunk([], 3), []);
assert.throws(() => chunk([1], 0), RangeError);
```

Complexity: O(n) time and output.

#### Follow-ups

- **Use it for batching API calls.** Chunk the ids, then send batches with a concurrency limit
  ([promise pool](#/code-async)).

### Flatten a nested array to a given depth {medium core}

Implement `flatten(arr, depth = Infinity)` without using `Array.prototype.flat`.
`flatten([1, [2, [3, [4]]]], 1)` → `[1, 2, [3, [4]]]`; with no depth → `[1, 2, 3, 4]`.

#### Hints

1. Recursion: for each element, if it is an array and depth > 0, flatten it with depth − 1.
2. An iterative version uses a stack of `[value, depth]` pairs and avoids recursion limits on deep input.

#### Solution

The recursive version is the clearest. Mention the iterative one for very deep nesting.

```ts
import assert from 'node:assert/strict';

type Nested<T> = T | Nested<T>[];

function flatten<T>(items: readonly Nested<T>[], depth = Infinity): Nested<T>[] {
  const out: Nested<T>[] = [];
  for (const item of items) {
    if (Array.isArray(item) && depth > 0) out.push(...flatten(item, depth - 1));
    else out.push(item);
  }
  return out;
}

assert.deepEqual(flatten([1, [2, [3, [4]]]]), [1, 2, 3, 4]);
assert.deepEqual(flatten([1, [2, [3, [4]]]], 1), [1, 2, [3, [4]]]);
assert.deepEqual(flatten([[], [[]]]), []);
assert.deepEqual(flatten([1, 2], 0), [1, 2]);
```

Complexity: O(total elements) time; recursion depth equals the nesting depth.

#### Follow-ups

- **Why can `out.push(...big)` fail?** Spreading a very large array into arguments can exceed the engine's argument
  limit. Loop and push instead for huge inputs.
- **Flatten a nested object** into dotted keys: see [practical tasks](#/code-practical-ts).

### Second largest distinct number {easy}

Return the second largest distinct value, or `null` if there is none. `[5, 1, 5, 3]` → 3; `[2, 2]` → null.

#### Hints

1. Sorting works but costs O(n log n).
2. One pass tracking the largest and second largest; skip values equal to the largest.

#### Solution

Track "no value yet" with `null` rather than `-Infinity`, so an input that really contains `-Infinity` is still
answered correctly.

```ts
import assert from 'node:assert/strict';

function secondLargest(nums: readonly number[]): number | null {
  let first: number | null = null;
  let second: number | null = null;
  for (const n of nums) {
    if (first === null || n > first) {
      second = first;
      first = n;
    } else if (n < first && (second === null || n > second)) {
      second = n;
    }
  }
  return second;
}

assert.equal(secondLargest([5, 1, 5, 3]), 3);
assert.equal(secondLargest([2, 2]), null);
assert.equal(secondLargest([]), null);
assert.equal(secondLargest([-1, -5]), -5);
assert.equal(secondLargest([3, -Infinity]), -Infinity);
assert.equal(secondLargest([1, 2, 3, 4]), 3);
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **The k-th largest?** A min-heap of size k gives O(n log k); quickselect gives O(n) on average.

### Missing number from 0 to n {easy}

An array holds n distinct numbers from the range 0..n. Return the missing one. `[3, 0, 1]` → 2.

#### Hints

1. A `Set` works with O(n) extra space.
2. The sum of 0..n is n(n+1)/2; subtract the actual sum.

#### Solution

The arithmetic version uses O(1) space. XOR is the overflow-proof alternative in languages with fixed-size integers.

```ts
import assert from 'node:assert/strict';

function missingNumber(nums: readonly number[]): number {
  const n = nums.length;
  let expected = (n * (n + 1)) / 2;
  for (const x of nums) expected -= x;
  return expected;
}

assert.equal(missingNumber([3, 0, 1]), 2);
assert.equal(missingNumber([0]), 1);
assert.equal(missingNumber([1]), 0);
assert.equal(missingNumber([9, 6, 4, 2, 3, 5, 7, 0, 1]), 8);
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Two numbers are missing.** Use the sum and the sum of squares, or XOR and split by a set bit.

### Convert camelCase keys to snake_case {easy}

Convert a camelCase identifier to snake_case: `"agentRunId"` → `"agent_run_id"`; `"HTTPStatus"` → `"http_status"`.
Then convert every key of a flat object, which is what an API layer between a TS front end and a Python back end does.

#### Hints

1. Insert an underscore before an upper-case letter that follows a lower-case letter or digit.
2. For acronyms, also split between an upper-case run and an upper-case letter followed by lower case.

#### Solution

Two regular expressions cover both cases; then lower-case the result.

```ts
import assert from 'node:assert/strict';

function toSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function keysToSnake(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [toSnake(k), v]));
}

assert.equal(toSnake('agentRunId'), 'agent_run_id');
assert.equal(toSnake('HTTPStatus'), 'http_status');
assert.equal(toSnake('step2Name'), 'step2_name');
assert.equal(toSnake('id'), 'id');
assert.deepEqual(keysToSnake({ runId: 1, createdAt: 'x' }), { run_id: 1, created_at: 'x' });
```

Complexity: O(n) per identifier.

#### Follow-ups

- **Nested objects and arrays?** Recurse into plain objects and arrays, leaving other values alone.
- **Avoid this entirely?** Agree one casing in the API contract, or let Pydantic aliases (`alias_generator`) handle it on
  the Python side.

### Group records by a key {easy core}

Write `groupBy(items, keyFn)` that returns a `Record<string, T[]>` without using `Object.groupBy`.
Group runs by status: `{done: [...], failed: [...]}`.

#### Hints

1. One pass; look up the bucket or create it.
2. Type the key function as returning `string` (or `PropertyKey`) so the result can be a `Record`.

#### Solution

```ts
import assert from 'node:assert/strict';

function groupBy<T>(items: readonly T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    (groups[key] ??= []).push(item);
  }
  return groups;
}

const runs = [
  { id: 'r1', status: 'done' },
  { id: 'r2', status: 'failed' },
  { id: 'r3', status: 'done' },
];
assert.deepEqual(groupBy(runs, (r) => r.status), {
  done: [runs[0], runs[2]],
  failed: [runs[1]],
});
assert.deepEqual(groupBy([], (x: string) => x), {});

// With built-ins allowed, this is one line (ES2024).
assert.deepEqual({ ...Object.groupBy(runs, (r) => r.status) }, groupBy(runs, (r) => r.status));

// The prototype-key trap from the follow-up: "__proto__" finds Object.prototype, which has no push().
assert.throws(() => groupBy([{ status: '__proto__' }], (r) => r.status), TypeError);
assert.deepEqual(Object.keys(Object.groupBy([{ status: '__proto__' }], (r) => r.status)), ['__proto__']);
```

Complexity: O(n) time and space.

#### Follow-ups

- **What about a key like `"__proto__"` or `"constructor"`?** With a plain `{}`, `groups['__proto__'] ??= []` finds the
  inherited `Object.prototype` (or the `Object` function for `"constructor"`) instead of creating a bucket, and `push`
  throws. Start from `Object.create(null)` or use a `Map` for untrusted keys. `Object.groupBy` already returns a
  null-prototype object for this reason.
- **Aggregate instead of collecting** (count, sum, max): keep a number per key instead of an array.

### Rotate an array by k steps {medium}

Rotate an array to the right by k steps in place. `[1,2,3,4,5,6,7]`, k = 3 → `[5,6,7,1,2,3,4]`. k can be larger than
the length.

#### Hints

1. k larger than n wraps around: use `k % n`.
2. Copying into a new array at `(i + k) % n` is O(n) space.
3. In place: reverse the whole array, then reverse the first k and the remaining n − k.

#### Solution

The three-reversal trick is O(1) extra space and easy to prove with a small example.

```ts
import assert from 'node:assert/strict';

function reverse(a: number[], from: number, to: number): void {
  while (from < to) {
    [a[from], a[to]] = [a[to], a[from]];
    from++;
    to--;
  }
}

function rotate(nums: number[], k: number): void {
  const n = nums.length;
  if (n === 0) return;
  k %= n;
  reverse(nums, 0, n - 1);
  reverse(nums, 0, k - 1);
  reverse(nums, k, n - 1);
}

const a = [1, 2, 3, 4, 5, 6, 7];
rotate(a, 3);
assert.deepEqual(a, [5, 6, 7, 1, 2, 3, 4]);
const b = [1, 2];
rotate(b, 5);
assert.deepEqual(b, [2, 1]);
const empty: number[] = [];
rotate(empty, 3);
assert.deepEqual(empty, []);
```

Complexity: O(n) time, O(1) extra space.

#### Follow-ups

- **Rotate left?** Rotate right by `n - (k % n)`.

### Top k most frequent words with tie-breaking {medium}

Return the k most frequent words, sorted by frequency descending, then alphabetically for ties.
`(["retry","ok","retry","timeout","ok","abort"], 2)` → `["ok", "retry"]`.

#### Hints

1. Count with a `Map`.
2. Sort the entries with a two-key comparator: count descending, then the word ascending.
3. For a huge vocabulary and small k, a heap of size k avoids sorting everything.

#### Solution

Counting plus a full sort is O(n + u log u) for u unique words and is the expected first answer. Mention the heap for
large u.

```ts
import assert from 'node:assert/strict';

function topKWords(words: readonly string[], k: number): string[] {
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, Math.max(0, k)) // a negative k would make slice drop items from the end
    .map(([w]) => w);
}

assert.deepEqual(topKWords(['retry', 'ok', 'retry', 'timeout', 'ok', 'abort'], 2), ['ok', 'retry']);
assert.deepEqual(topKWords(['b', 'a', 'c'], 2), ['a', 'b']);
assert.deepEqual(topKWords([], 3), []);
assert.deepEqual(topKWords(['x'], 0), []);
assert.deepEqual(topKWords(['a', 'b'], -1), []);
```

Complexity: O(n + u log u) time, O(u) space.

#### Follow-ups

- **Why compare with `<` rather than `localeCompare`?** `localeCompare` follows locale rules (case and accents), while
  plain `<` compares code units, which is what "lexicographic" usually means in these problems. Ask which they want.
- **Words arrive as a stream.** Keep counts in a `Map` and a size-k min-heap, or a count-min sketch when memory is tight.
