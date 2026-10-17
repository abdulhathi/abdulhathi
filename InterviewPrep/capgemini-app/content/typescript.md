---
title: TypeScript in depth
goal: Explain and write the TypeScript a senior full-stack engineer is expected to know (narrowing, discriminated unions, generics, conditional and mapped types, runtime validation with zod), and say how TypeScript is compiled and run today.
minutes: 55
---

A senior React and Node role assumes TypeScript fluency, so interviewers test the parts that separate fluent users from people who annotate variables: **narrowing**, **discriminated unions** with exhaustive checks, **generics** with constraints, **conditional and mapped types**, and the difference between compile-time types and **runtime validation**. On an agent platform, almost everything that crosses a boundary has several shapes: a stream event can be a token, a tool call or an error, and an agent run can be queued, running, waiting for approval, or finished. Unions model that, and the compiler then checks that every case is handled.

**Your angle:** your resume lists TypeScript with React at Medidata and The Dot Corp, and Node.js services. On the Document AI platform at Quantiphi you used **Pydantic schemas as a data contract** on extracted fields. zod plays exactly that role in TypeScript: one schema gives you both the static type and the runtime check.

## Structural typing: how the compiler thinks

TypeScript checks **shapes, not names**. A value is assignable to a type if it has at least the required properties with compatible types, whatever it was declared as. Two exceptions catch people out. A **fresh object literal** gets an extra "excess property check", so typos in literals are reported. And **classes with `#private` fields** behave nominally, because the private member's identity is part of the type.

```ts
import assert from 'node:assert/strict';

type ToolCall = { id: string; name: string };

class LoggedToolCall {
  id = 'call_1';
  name = 'search_tickets';
  loggedAt = Date.now(); // an extra property is fine: the shape still matches
}

function describe(call: ToolCall): string {
  return `${call.name}#${call.id}`;
}

// Structural: LoggedToolCall was never declared as a ToolCall, but it has the right shape.
assert.equal(describe(new LoggedToolCall()), 'search_tickets#call_1');

// A variable that happens to have extra properties is also fine...
const fromApi = { id: 'call_2', name: 'create_po', raw: '{...}' };
assert.equal(describe(fromApi), 'create_po#call_2');

function typeTests() {
  // ...but a fresh object literal gets an excess property check, which catches typos.
  // @ts-expect-error 'nmae' does not exist in type ToolCall
  describe({ id: 'call_3', nmae: 'typo' });
}
void typeTests;
```

`// @ts-expect-error` is a useful teaching and testing tool: compilation fails if the next line does **not** have an error, so it proves that the compiler rejects bad code.

### type or interface

Both describe object shapes. `interface` supports `extends` and **declaration merging** (two declarations with the same name combine, which is how libraries let you augment their types). `type` can name anything: unions, intersections, tuples, mapped and conditional types. A common team rule is "`type` by default, `interface` for public object contracts that others may extend". Consistency matters more than the choice.

## Narrowing

TypeScript follows your control flow and **narrows** a union to the members still possible in each branch.

| Technique | Example | Narrows to |
|---|---|---|
| `typeof` | `typeof x === 'string'` | primitive types |
| truthiness / equality | `if (x)`, `x === null`, `x != null` | removes `null` / `undefined` / literals |
| `in` | `'error' in res` | union members that have the property |
| `instanceof` | `e instanceof HttpError` | class instances |
| discriminant | `ev.type === 'token'` | the matching union member |
| type predicate | `function isX(v): v is X` | whatever the predicate claims |
| assertion function | `function assertX(v): asserts v is X` | narrows after the call, throws otherwise |

```ts
import assert from 'node:assert/strict';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ApiResult = { data: string[] } | { error: string; retryAfterMs?: number };

function summarise(res: ApiResult): string {
  if ('error' in res) {
    // res is { error: string; retryAfterMs?: number } here
    return res.retryAfterMs ? `retry in ${res.retryAfterMs} ms` : `failed: ${res.error}`;
  }
  return `${res.data.length} items`; // and { data: string[] } here
}

// A type predicate: the caller's variable is narrowed when this returns true.
function isHttpError(e: unknown): e is HttpError {
  return e instanceof HttpError;
}

// An assertion function: after the call, the value is known to be non-null.
function assertDefined<T>(value: T, message: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) throw new Error(message);
}

function statusOf(e: unknown): number {
  if (isHttpError(e)) return e.status; // e: HttpError
  if (e instanceof Error) return 500; // e: Error
  return 520; // e: unknown, a non-Error was thrown
}

const env: Record<string, string | undefined> = { REGION: 'us-central1' };
const region = env.REGION;
assertDefined(region, 'REGION is required');
const upper: string = region.toUpperCase(); // region: string after the assertion

// Since TypeScript 5.5, simple filters infer a type predicate: ids is string[], not (string | undefined)[].
const ids = ['a', undefined, 'b'].filter((x) => x !== undefined);

assert.equal(summarise({ data: ['x', 'y'] }), '2 items');
assert.equal(summarise({ error: 'quota', retryAfterMs: 500 }), 'retry in 500 ms');
assert.equal(statusOf(new HttpError(429, 'slow down')), 429);
assert.equal(statusOf('boom'), 520);
assert.equal(upper, 'US-CENTRAL1');
assert.deepEqual(ids, ['a', 'b']);
```

`catch (e)` gives you `unknown` under `strict` (`useUnknownInCatchVariables`), because JavaScript can throw anything. Narrow it before use, as `statusOf` does.

## Discriminated unions for stream events and agent states

A **discriminated union** is a union of object types that share a literal property (the discriminant, here `type` or `status`). Switching on it narrows each branch, and a `never` check at the end turns "I forgot a case" into a compile error. This is the most useful pattern in the chapter for this platform.

```ts
import assert from 'node:assert/strict';

// Everything the backend can push down the stream for one agent run.
type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; ok: boolean; output: string }
  | { type: 'approval_required'; id: string; action: string }
  | { type: 'error'; code: 'rate_limited' | 'internal'; message: string }
  | { type: 'done'; finishReason: 'stop' | 'length' | 'cancelled' };

type ToolView = { name: string; status: 'running' | 'ok' | 'failed' };
type RunView = {
  text: string;
  tools: Record<string, ToolView>;
  pendingApproval: { id: string; action: string } | null;
  status: 'streaming' | 'waiting' | 'done' | 'failed';
  error: string | null;
};

const initial: RunView = { text: '', tools: {}, pendingApproval: null, status: 'streaming', error: null };

function assertNever(value: never): never {
  throw new Error(`Unhandled event: ${JSON.stringify(value)}`);
}

export function applyEvent(view: RunView, ev: StreamEvent): RunView {
  switch (ev.type) {
    case 'token':
      return { ...view, text: view.text + ev.text }; // ev.text exists only on token events
    case 'tool_call':
      return { ...view, tools: { ...view.tools, [ev.id]: { name: ev.name, status: 'running' } } };
    case 'tool_result': {
      const tool = view.tools[ev.id];
      if (!tool) return view; // a result for an unknown call: ignore rather than crash
      return { ...view, tools: { ...view.tools, [ev.id]: { ...tool, status: ev.ok ? 'ok' : 'failed' } } };
    }
    case 'approval_required':
      return { ...view, status: 'waiting', pendingApproval: { id: ev.id, action: ev.action } };
    case 'error':
      return { ...view, status: 'failed', error: `${ev.code}: ${ev.message}` };
    case 'done':
      return { ...view, status: ev.finishReason === 'cancelled' ? 'failed' : 'done', pendingApproval: null };
    default:
      // If someone adds a new event type and forgets it here, this line stops compiling.
      return assertNever(ev);
  }
}

const events: StreamEvent[] = [
  { type: 'token', text: 'Checking ' },
  { type: 'tool_call', id: 't1', name: 'lookup_po', args: { po: '4500012' } },
  { type: 'tool_result', id: 't1', ok: true, output: 'PO found' },
  { type: 'token', text: 'the order.' },
  { type: 'done', finishReason: 'stop' },
];
const final = events.reduce(applyEvent, initial);

assert.equal(final.text, 'Checking the order.');
assert.deepEqual(final.tools, { t1: { name: 'lookup_po', status: 'ok' } });
assert.equal(final.status, 'done');
assert.equal(applyEvent(initial, { type: 'error', code: 'rate_limited', message: 'retry later' }).error, 'rate_limited: retry later');
```

The same idea models an agent run's lifecycle. Each state carries only the data that makes sense in it, so "succeeded with an error message" cannot be represented at all. `as const satisfies` keeps the transition table's literal types while still checking that every status has an entry:

```ts
import assert from 'node:assert/strict';

type RunState =
  | { status: 'queued' }
  | { status: 'running'; step: number }
  | { status: 'awaiting_approval'; step: number; action: string }
  | { status: 'succeeded'; output: string }
  | { status: 'failed'; error: string };

type Status = RunState['status']; // 'queued' | 'running' | ... derived, never duplicated

const NEXT = {
  queued: ['running', 'failed'],
  running: ['running', 'awaiting_approval', 'succeeded', 'failed'],
  awaiting_approval: ['running', 'failed'],
  succeeded: [],
  failed: [],
} as const satisfies Record<Status, readonly Status[]>;

function canMove(from: Status, to: Status): boolean {
  return (NEXT[from] as readonly Status[]).includes(to);
}

function transition(state: RunState, next: RunState): RunState {
  if (!canMove(state.status, next.status)) throw new Error(`Illegal transition ${state.status} -> ${next.status}`);
  return next;
}

let run: RunState = { status: 'queued' };
run = transition(run, { status: 'running', step: 1 });
run = transition(run, { status: 'awaiting_approval', step: 1, action: 'create_po' });
run = transition(run, { status: 'running', step: 2 });
run = transition(run, { status: 'succeeded', output: 'PO 4500012 created' });

assert.equal(run.status, 'succeeded');
assert.throws(() => transition(run, { status: 'running', step: 3 }), /Illegal transition succeeded -> running/);
```

The [State machines](#/state-machines) chapter takes this further with XState and durable workflows.

## Generics

A generic lets a type **flow through** a function or component instead of being lost to `any`. Constraints (`extends`) say what the type must support; TypeScript usually **infers** the type argument from the call.

```ts
import assert from 'node:assert/strict';

// K extends PropertyKey: the key must be usable as an object key.
function indexBy<T, K extends PropertyKey>(items: readonly T[], keyOf: (item: T) => K): Record<K, T> {
  const out = {} as Record<K, T>;
  for (const item of items) out[keyOf(item)] = item;
  return out;
}

type Step = { id: string; name: string; ms: number };
const steps: Step[] = [
  { id: 's1', name: 'plan', ms: 120 },
  { id: 's2', name: 'call_tool', ms: 840 },
];
const byId = indexBy(steps, (s) => s.id); // Record<string, Step>, inferred
assert.equal(byId.s2?.name, 'call_tool');

// A lookup type: the return type depends on the key you pass.
type Settings = { timeoutMs: number; region: string; streaming: boolean };
const settings: Settings = { timeoutMs: 30_000, region: 'us-central1', streaming: true };
function get<K extends keyof Settings>(key: K): Settings[K] {
  return settings[key];
}
const timeout: number = get('timeoutMs');
const region: string = get('region');

// const type parameters (TS 5.0) infer literal types without the caller writing `as const`.
function defineRoles<const R extends readonly string[]>(roles: R): R {
  return roles;
}
const roles = defineRoles(['viewer', 'operator', 'admin']); // readonly ['viewer', 'operator', 'admin']
type Role = (typeof roles)[number]; // 'viewer' | 'operator' | 'admin'
const me: Role = 'operator';

// NoInfer (TS 5.4): infer T from the list only, then check the default against it.
function pick<T extends string>(options: readonly T[], fallback: NoInfer<T>): T {
  return options[0] ?? fallback;
}
pick(['sse', 'websocket'], 'sse');

function typeTests() {
  // @ts-expect-error 'grpc' is not one of the options
  pick(['sse', 'websocket'], 'grpc');
}
void typeTests;

assert.equal(timeout + region.length, 30_011);
assert.equal(me, 'operator');
```

Rules of thumb: add a type parameter only if it relates two or more positions (an input to an output, or two inputs); otherwise use the concrete type. Constrain as little as you need. Prefer inference over making callers write `fn<Thing>(...)`.

## Conditional, mapped and template literal types

These are how library types (and your own helpers) compute new types from old ones.

- **Conditional types**: `T extends U ? X : Y`. With a naked type parameter they **distribute** over unions: `ToArray<'a' | 'b'>` becomes `'a'[] | 'b'[]`. Wrap in brackets (`[T] extends [U]`) to stop that.
- **`infer`** captures part of a type inside a conditional: the element of an array, the resolved value of a promise, the parameters of a function.
- **Mapped types** loop over keys: `{ [K in keyof T]: ... }`, with modifiers (`readonly`, `?`, `-readonly`, `-?`) and **key remapping** with `as`.
- **Template literal types** build string types: `` `on${Capitalize<K>}` ``, `` `run.${'started' | 'finished'}` ``.

```ts
import assert from 'node:assert/strict';

// Type-level tests: Expect<Equal<A, B>> fails to compile unless A and B are identical.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// infer: unwrap things.
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;
type Resolved<T> = T extends Promise<infer V> ? Resolved<V> : T; // the built-in Awaited<T> does this properly
type FirstArg<F> = F extends (first: infer A, ...rest: never[]) => unknown ? A : never;

// Distribution over unions.
type ToArray<T> = T extends unknown ? T[] : never;

// Mapped type with key remapping: build handler names from event names.
type RunEvents = { started: { runId: string }; stepFinished: { step: string }; failed: { error: string } };
type Handlers<E> = { [K in keyof E & string as `on${Capitalize<K>}`]: (payload: E[K]) => void };

// Remove readonly and optional modifiers.
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Complete<T> = { [K in keyof T]-?: T[K] };

// Filter keys by the type of their value. The -? matters: without it, an optional property
// would add `undefined` to the resulting union of keys.
type KeysOfType<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];

type Run = { readonly id: string; status: 'queued' | 'done'; retries?: number; startedAt: Date };

export type Tests = [
  Expect<Equal<ElementOf<string[]>, string>>,
  Expect<Equal<Resolved<Promise<Promise<number>>>, number>>,
  Expect<Equal<FirstArg<(id: string, n: number) => void>, string>>,
  Expect<Equal<ToArray<'a' | 'b'>, 'a'[] | 'b'[]>>,
  Expect<Equal<keyof Handlers<RunEvents>, 'onStarted' | 'onStepFinished' | 'onFailed'>>,
  Expect<Equal<Mutable<Run>['id'], string>>,
  Expect<Equal<Complete<Run>['retries'], number>>,
  Expect<Equal<KeysOfType<Run, string>, 'id' | 'status'>>,
];

// The types disappear at runtime; the handlers object is still checked against them.
const handlers: Handlers<RunEvents> = {
  onStarted: ({ runId }) => assert.ok(runId.startsWith('run_')),
  onStepFinished: ({ step }) => assert.ok(step.length > 0),
  onFailed: ({ error }) => assert.fail(error),
};
handlers.onStarted({ runId: 'run_42' });
handlers.onStepFinished({ step: 'plan' });
```

### The utility types you should know by heart

| Utility | What it does | Typical use |
|---|---|---|
| `Partial<T>` / `Required<T>` | all properties optional / required | PATCH bodies, form drafts, defaults merged in |
| `Readonly<T>` | all properties `readonly` (shallow) | state, config |
| `Pick<T, K>` / `Omit<T, K>` | keep / drop keys | props derived from a model, `Omit<Run, 'id'>` for create payloads |
| `Record<K, V>` | object with keys `K` and values `V` | lookup tables, `Record<Status, string>` labels |
| `Exclude<U, X>` / `Extract<U, X>` | remove / keep union members | `Extract<StreamEvent, { type: 'token' }>` |
| `NonNullable<T>` | remove `null` and `undefined` | after validation |
| `ReturnType<F>` / `Parameters<F>` | function result / argument tuple | `ReturnType<typeof store.getState>` |
| `Awaited<T>` | unwrap promises recursively | the result type of an async function |
| `NoInfer<T>` | block inference from this position | defaults that must match an inferred union |

## satisfies, as const, unknown, never

- **Annotation** (`const x: T = ...`): the variable's type **is** `T`; you lose the more specific literal types.
- **`satisfies T`** (TS 4.9): check the value against `T` but keep the **inferred**, narrower type.
- **`as T`** (assertion): tell the compiler to trust you. No runtime check. Use it at well-understood seams only.
- **`as const`**: infer the narrowest type: literal values, `readonly` arrays and tuples.
- **`unknown`**: a safe "could be anything"; you must narrow before use. **`any`**: switches checking off, and it spreads.
- **`never`**: the empty type: the result of exhaustive narrowing, a function that always throws, an impossible branch.

```ts
import assert from 'node:assert/strict';

type Env = 'dev' | 'sit' | 'uat' | 'prod';
type EnvConfig = { apiUrl: string; streaming: 'sse' | 'websocket'; minInstances?: number };

// satisfies: every environment must be present and valid, but literal types survive.
const CONFIG = {
  dev: { apiUrl: 'http://localhost:8010', streaming: 'sse' },
  sit: { apiUrl: 'https://sit.example.internal', streaming: 'sse' },
  uat: { apiUrl: 'https://uat.example.internal', streaming: 'websocket' },
  prod: { apiUrl: 'https://api.example.com', streaming: 'websocket', minInstances: 2 },
} satisfies Record<Env, EnvConfig>;

// Because the literal types were kept, this is known to exist without a check:
const prodMin: number = CONFIG.prod.minInstances;

// With an annotation instead, minInstances would be number | undefined everywhere.
const annotated: Record<Env, EnvConfig> = CONFIG;
const maybe: number | undefined = annotated.dev.minInstances;

// as const: a readonly tuple of literals, and a union type derived from it.
const RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const;
type RunStatus = (typeof RUN_STATUSES)[number];
function isRunStatus(s: string): s is RunStatus {
  return (RUN_STATUSES as readonly string[]).includes(s);
}

function typeTests() {
  // @ts-expect-error 'ws' is not a valid streaming mode, caught by satisfies
  const bad = { dev: { apiUrl: '', streaming: 'ws' } } satisfies Partial<Record<Env, EnvConfig>>;
  void bad;
}
void typeTests;

assert.equal(prodMin, 2);
assert.equal(maybe, undefined);
assert.ok(isRunStatus('running'));
assert.ok(!isRunStatus('paused'));
```

### Prefer union literals to enums

`enum` generates runtime code, so it is not **erasable**: Node's built-in type stripping rejects it, and `erasableSyntaxOnly` flags it. Numeric enums are also loosely typed. A union of string literals plus an `as const` array or object gives you the same autocomplete, exhaustiveness and a runtime list, with no generated code. The same applies to `namespace` and constructor parameter properties (`constructor(private x: number)`): write a normal field instead.

## Variance, function types and soundness

`strictFunctionTypes` checks function **parameters** contravariantly: a handler that accepts only `TokenEvent` cannot be used where a handler for any `StreamEvent` is required, because it would be called with events it cannot handle. Two deliberate holes remain: **method shorthand** (`handle(ev: E): void` in an interface) is still checked bivariantly, and **arrays are covariant**, so a `Dog[]` can be assigned to an `Animal[]` and then have a `Cat` pushed into it. Prefer `readonly T[]` for inputs (which makes covariance safe) and property syntax (`handle: (ev: E) => void`) for callbacks you want checked strictly.

```ts
type StreamEvent = { type: 'token'; text: string } | { type: 'done' };
type TokenEvent = Extract<StreamEvent, { type: 'token' }>;

type StrictListener = { handle: (ev: StreamEvent) => void }; // property syntax: checked strictly
type LooseListener = { handle(ev: StreamEvent): void }; // method syntax: bivariant

const onlyTokens = (ev: TokenEvent) => ev.text.length;

function typeTests() {
  // @ts-expect-error a token-only handler would crash on a 'done' event
  const strict: StrictListener = { handle: onlyTokens };
  const loose: LooseListener = { handle: onlyTokens }; // allowed, and unsound
  void strict;
  void loose;
}
void typeTests;
```

## Overloads and declaration merging

**Overloads** give one function several call signatures. They are useful when the return type depends on the argument in a way a generic cannot express neatly; a generic with a lookup type (as in `get<K extends keyof Settings>`) is usually simpler. Only the overload signatures are visible to callers, not the implementation signature.

```ts
import assert from 'node:assert/strict';

type Run = { id: string; status: 'queued' | 'running' | 'done' };
const runs: Run[] = [
  { id: 'r1', status: 'done' },
  { id: 'r2', status: 'running' },
];

// One id returns one run (or undefined); a list of ids returns a list.
function findRuns(id: string): Run | undefined;
function findRuns(ids: readonly string[]): Run[];
function findRuns(arg: string | readonly string[]): Run | undefined | Run[] {
  if (typeof arg === 'string') return runs.find((r) => r.id === arg);
  return runs.filter((r) => arg.includes(r.id));
}

const one = findRuns('r2'); // Run | undefined
const many = findRuns(['r1', 'r2']); // Run[]

assert.equal(one?.status, 'running');
assert.equal(many.length, 2);
```

**Declaration merging**: two `interface` declarations with the same name in the same scope merge into one. Libraries use it so that you can **augment** their types: for example, adding a `user` property to Express's `Request` with `declare module 'express-serve-static-core' { interface Request { user?: AuthUser } }` in a `.d.ts` file. Use it sparingly and in one place, because the change is global to the project.

## Runtime validation at the boundary with zod

TypeScript types are erased: at runtime, `JSON.parse` returns whatever the server sent, and `as StreamEvent` checks nothing. Anything from outside the process (HTTP bodies, SSE `data:` payloads, WebSocket messages, LLM tool-call arguments, environment variables, `localStorage`) should be **parsed** at the boundary. With zod you write the schema once and **infer** the type from it, so the two cannot drift.

```ts
import assert from 'node:assert/strict';
import { z } from 'zod';

// One schema per event; the discriminated union validates and narrows in one pass.
const StreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({ type: z.literal('tool_call'), id: z.string(), name: z.string(), args: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('error'), code: z.enum(['rate_limited', 'internal']), message: z.string() }),
  z.object({ type: z.literal('done'), finishReason: z.enum(['stop', 'length', 'cancelled']) }),
]);
type StreamEvent = z.infer<typeof StreamEventSchema>; // the static type, derived from the schema

// Parse an SSE data line: bad JSON or a bad shape becomes null instead of a crash deep in the UI.
function parseEventData(data: string): StreamEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }
  const result = StreamEventSchema.safeParse(json);
  return result.success ? result.data : null;
}

assert.deepEqual(parseEventData('{"type":"token","text":"Hi"}'), { type: 'token', text: 'Hi' });
assert.equal(parseEventData('{"type":"done","finishReason":"exploded"}'), null);
assert.equal(parseEventData('not json'), null);

// parse throws a ZodError with every issue; prettifyError makes it readable for logs.
const bad = StreamEventSchema.safeParse({ type: 'error', code: 'teapot', message: 42 });
assert.ok(!bad.success);
const report = z.prettifyError(bad.error);
assert.match(report, /code/);
assert.match(report, /message/);

// Environment variables: coerce strings, apply defaults, fail fast at startup.
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  API_BASE_URL: z.url(),
});
const env = EnvSchema.parse({ PORT: '8010', API_BASE_URL: 'https://api.example.com' });
assert.deepEqual(env, { PORT: 8010, LOG_LEVEL: 'info', API_BASE_URL: 'https://api.example.com' });
assert.throws(() => EnvSchema.parse({ PORT: 'eighty' }));

// zod 4 can emit JSON Schema, which is what LLM tool definitions use.
const LookupPoArgs = z.object({ poNumber: z.string().describe('SAP purchase order number'), includeLines: z.boolean() });
const jsonSchema = z.toJSONSchema(LookupPoArgs);
assert.deepEqual(jsonSchema.required, ['poNumber', 'includeLines']);
```

`parse` throws on failure; `safeParse` returns `{ success, data | error }`. Use `safeParse` where bad input is expected (network messages, user input) and `parse` where failure should stop the program (startup configuration). Validate **once at the edge** and pass typed values inward; do not re-validate in every function.

## Branded types

Structural typing means a `TenantId` and a `RunId`, both `string`, are interchangeable, and swapping them is a classic bug. A **brand** adds a phantom property that exists only in the type system, so the compiler keeps them apart. Values get the brand only through a constructor function that validates them.

```ts
import assert from 'node:assert/strict';

type Brand<T, B extends string> = T & { readonly __brand: B };
type RunId = Brand<string, 'RunId'>;
type TenantId = Brand<string, 'TenantId'>;

// A value and a type can share a name: RunId(...) validates and brands.
const RunId = (s: string): RunId => {
  if (!/^run_[a-z0-9]{4,}$/.test(s)) throw new Error(`Invalid run id: ${s}`);
  return s as RunId;
};
const TenantId = (s: string): TenantId => {
  if (!/^t_[a-z0-9]+$/.test(s)) throw new Error(`Invalid tenant id: ${s}`);
  return s as TenantId;
};

function cancelRun(tenant: TenantId, run: RunId): string {
  return `DELETE /tenants/${tenant}/runs/${run}`;
}

const tenant = TenantId('t_acme');
const run = RunId('run_9f3k');
assert.equal(cancelRun(tenant, run), 'DELETE /tenants/t_acme/runs/run_9f3k');
assert.throws(() => RunId('42'), /Invalid run id/);

function typeTests() {
  // @ts-expect-error arguments swapped: the brands do not match
  cancelRun(run, tenant);
  // @ts-expect-error a plain string has no brand
  cancelRun(tenant, 'run_raw');
}
void typeTests;
```

zod has the same feature: `z.string().regex(...).brand<'RunId'>()`.

## Keeping front-end and back-end types in sync

Hand-writing response types on the client is how contracts drift. Options, from most to least common:

| Approach | How it works | Good when |
|---|---|---|
| **OpenAPI → TS types** | `openapi-typescript` turns the backend's `openapi.json` (FastAPI generates it) into a `paths` type; `openapi-fetch` gives a typed client with no runtime cost | Python or any non-TS backend, public REST APIs |
| **Shared zod schemas** | a package imported by both a Node backend and the React app | TS on both sides |
| **tRPC** | the client calls server procedures with types inferred end to end, no schema file | TS monorepo, internal APIs |
| **Protobuf code generation** | `protobuf-es`, `ts-proto` or Connect generate types and clients from `.proto` files | gRPC services, see [gRPC](#/grpc) |

```bash
# Generate types from a FastAPI backend, then run the type-check in CI so drift breaks the build.
npx openapi-typescript http://localhost:8010/openapi.json -o src/api/schema.d.ts
npx tsc --noEmit
```

## tsconfig and strict flags

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

- **`strict`** turns on the family: `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `strictBuiltinIteratorReturn`, `useUnknownInCatchVariables`, `alwaysStrict`, `noImplicitThis`. Since TypeScript 6.0 it is on by default.
- **`noUncheckedIndexedAccess`**: `arr[i]` and `record[key]` include `undefined`, which matches reality and catches many crashes. The most valuable flag beyond `strict`.
- **`exactOptionalPropertyTypes`**: `retries?: number` means "absent or a number", not "may be set to `undefined`".
- **`verbatimModuleSyntax`** + **`isolatedModules`**: each file can be transpiled alone (esbuild, SWC, Vite, Node), and type-only imports must say `import type`.
- **`erasableSyntaxOnly`** (TS 5.8): forbids syntax that generates code (`enum`, `namespace`, parameter properties), so the file can run with plain type stripping.
- **`moduleResolution`**: `bundler` for Vite/webpack apps, `nodenext` for code that Node runs directly.

## How TypeScript runs today

| Tool | Type-checks? | Role |
|---|---|---|
| `tsc` | yes | the type checker; in apps usually run as `tsc --noEmit` in CI and the editor |
| Vite, esbuild, SWC | no | strip types fast for the dev server and builds |
| Node (24.12+ / 25.2+) | no | runs `.ts` files directly by **type stripping** (stable; unflagged since 22.18 / 23.6); erasable syntax only, ignores `tsconfig.json` |
| `tsx` (the package) | no | runs TS in Node with esbuild, including non-erasable syntax |
| Bun, Deno | no | run TS natively |

**TypeScript 7** is the native port of the compiler, written in **Go**. Microsoft's benchmarks show full builds around 10× faster on large codebases and much faster editor start-up. The language is the same: code that compiles cleanly on 6.0 should compile the same way on 7.0. TypeScript **6.0** (March 2026) was the bridge release, the last one built on the JavaScript compiler. It changed defaults (for example `strict` on by default and `types` defaulting to an empty list, so Node globals need `"types": ["node"]`) and deprecated old options such as `target: es5`, `moduleResolution: node` (node10), `baseUrl` and `outFile`, which 7.0 no longer supports. Tools built on the old JavaScript compiler API need the new API that the Go version exposes.

## Interview questions

### What does structural typing mean in TypeScript? {core}

TypeScript checks compatibility by **shape**, not by declared name: a value is assignable to a type if it has the required properties with compatible types, wherever it came from. That suits JavaScript, where objects are built ad hoc and come from JSON. Two exceptions: fresh object literals get an **excess property check** (so `{ nmae: 'x' }` is reported), and classes with private or `#private` members behave nominally.

The practical consequence: two `string`-based IDs are interchangeable unless you add a brand, and a type assertion on parsed JSON proves nothing, because the compiler never sees the runtime value.

### type or interface: which do you use? {core}

Both describe object shapes, and for plain props the difference is small. `interface` can be extended with `extends` and supports **declaration merging**, which is how libraries let you augment their types. `type` can express things interfaces cannot: unions, intersections, tuples, mapped and conditional types. I default to `type` because unions are everywhere in React and stream-event code, use `interface` for public contracts meant to be extended, and follow the team's convention.

A small detail: interfaces with `extends` report conflicting members as errors, while intersections of conflicting types quietly produce `never` properties.

### What is the difference between any, unknown and never? {core}

`any` disables type checking for that value, and the looseness spreads to everything it touches. `unknown` is the safe top type: it can hold anything, but you must narrow it (`typeof`, `instanceof`, a type guard, a schema parse) before using it. `never` is the empty type: the type of a value that cannot exist, a function that always throws, or the leftover after every union member is handled.

I use `unknown` for anything external (parsed JSON, `catch` variables, messages from a socket), `never` for exhaustiveness checks, and `any` only at an unavoidable seam, with a comment.

### How does narrowing work, and what are type predicates and assertion functions? {core}

TypeScript follows control flow: after `typeof x === 'string'`, `'error' in res`, `e instanceof HttpError`, `x != null` or a discriminant check, it narrows the union to the members still possible in that branch. A **type predicate** (`function isToolCall(e): e is ToolCallEvent`) is a user-defined check that narrows the caller's variable when it returns true. An **assertion function** (`asserts value is NonNullable<T>`) narrows after the call returns and throws otherwise, which suits validation at the top of a function.

The caveat: predicates are trusted, not verified, so a wrong predicate lies to the compiler. Keep them small, or derive them from a schema. Since TypeScript 5.5, simple arrow functions like `x => x !== undefined` infer a predicate automatically, so `filter` returns the narrowed array type.

### What is a discriminated union, and how do you make a switch exhaustive? {core}

A union of object types that share a literal property such as `type` or `status`. Checking that property narrows to one member, so each `case` sees only the fields that member has. For exhaustiveness, end the switch with `default: return assertNever(ev)`, where `assertNever` takes a `never` parameter. If a new member is added and not handled, the leftover type is no longer `never` and the code stops compiling.

I use this for stream events (token, tool call, tool result, approval required, error, done) and for agent run states, so "succeeded with an error" or "running without a step" simply cannot be represented.

### How would you type the events coming down an SSE or WebSocket stream? {core}

As a discriminated union on a `type` field, with one member per event and only the fields that event carries. The reducer that folds events into UI state switches on `type` with an exhaustive check. Because the data arrives as untrusted JSON, I define the union as a **zod discriminated union** and infer the TypeScript type from it, so every message is validated once at the socket boundary, and malformed or unknown messages are logged and dropped instead of crashing a component.

For evolution, the server should add new event types rather than change existing ones, and the client should ignore unknown types (log, then skip) so old clients keep working during a rollout.

### When do you use generics, and what do constraints do? {core}

When a type needs to **flow through**: the output relates to the input (`indexBy<T>(items: T[]) => Record<K, T>`), or two inputs must agree (`get<K extends keyof Settings>(key: K): Settings[K]`). A constraint (`K extends keyof T`, `T extends { id: string }`) states what the type must support, so the body can use it safely. TypeScript normally infers the type arguments from the call.

Anti-patterns: a type parameter used once (just use the concrete type), or a generic return type the caller must assert (`fetchJson<T>()` returning unvalidated data is an `as` cast in disguise; pass a schema instead).

### Explain conditional types and infer. {deep}

`T extends U ? X : Y` picks a type based on whether `T` is assignable to `U`. Inside the condition, `infer V` declares a type variable that TypeScript fills from the matched structure: `T extends Promise<infer V> ? V : T` extracts a promise's value type, and `F extends (...args: infer A) => unknown ? A : never` extracts parameters. That is how `ReturnType`, `Parameters` and `Awaited` are built.

When `T` is a naked type parameter, conditional types **distribute** over unions: `ToArray<'a' | 'b'>` is `'a'[] | 'b'[]`. Wrapping both sides in a tuple, `[T] extends [U]`, disables that.

### What are mapped types and key remapping? {deep}

A mapped type builds an object type by looping over keys: `{ [K in keyof T]: T[K] }`. You can change modifiers (`readonly`, `?`, or remove them with `-readonly`, `-?`), which is how `Partial`, `Required` and `Readonly` work. Key remapping with `as` renames or filters keys: `{ [K in keyof E & string as `on${Capitalize<K>}`]: (payload: E[K]) => void }` turns an event map into a handlers object. Mapping a key to `never` removes it.

### What are template literal types good for? {deep}

They build string literal types from other types: event names (`` `run.${'started' | 'failed'}` ``), handler names (`` `on${Capitalize<K>}` ``), CSS units, or extracting route parameters from `'/runs/:runId/steps/:stepId'` with `infer`, so a path builder requires exactly `{ runId, stepId }`. Combined with conditional types, they let a typed router or API client catch a misspelled parameter at compile time.

### What is the difference between satisfies, a type annotation and as? {core}

An annotation (`const config: Config = ...`) makes the variable's type exactly `Config`, so literal details are lost. `satisfies Config` checks the value against `Config` but keeps the narrower inferred type, so `CONFIG.prod.minInstances` is known to be a `number`, not `number | undefined`. `as Config` is an assertion: no check, you are telling the compiler to trust you.

I use `satisfies` for configuration tables and lookup objects, annotations for function signatures and public APIs, and `as` only where I have just validated the value or at a known library seam.

### Why validate at runtime if you already have TypeScript? {core}

Because types are erased: the compiler never sees the bytes that arrive over HTTP, SSE or WebSockets, or the JSON an LLM produces as tool-call arguments. A `fetch(...).json() as Run` is a promise you made, not a check. So I validate at every boundary with a schema library such as zod, infer the static type from the schema, and pass typed values inward. Inside the boundary, the compiler then holds.

**Your angle:** it is the same idea as the Pydantic schemas you used as the quality gate for extracted fields on the Document AI platform: treat external data as untrusted until it passes the contract.

### parse or safeParse, and where should validation live? {deep}

`parse` returns the data or throws a `ZodError` listing every issue; `safeParse` returns a result object with `success` and either `data` or `error`. Use `safeParse` where bad input is normal and must be handled (user forms, messages from a socket) and `parse` where bad input means the program cannot continue (environment variables at startup). Validate once, as close to the edge as possible: the API client, the socket message handler, the request handler. Then trust the types inside.

Also useful in zod 4: `z.coerce` for strings from query params and env vars, `z.prettifyError` for readable logs, and `z.toJSONSchema` to generate tool schemas for LLM function calling from the same definition.

### Should you use enums?

Usually not, in modern TypeScript. `enum` generates runtime code, so it is not **erasable**: Node's built-in type stripping refuses it, and `erasableSyntaxOnly` flags it. Numeric enums also accept any number. A union of string literals, with an `as const` array or object when you need a runtime list, gives the same autocomplete and exhaustiveness checks with no generated code: `const STATUSES = ['queued', 'running'] as const; type Status = (typeof STATUSES)[number]`.

The same reasoning applies to `namespace` and constructor parameter properties: use modules and normal class fields.

### What are branded types and when are they worth it? {deep}

A brand intersects a primitive with a phantom property (`string & { readonly __brand: 'RunId' }`) so the compiler treats a `RunId` and a `TenantId` as different, even though both are strings at runtime. Values are branded only by a constructor function that validates the format. They are worth it for identifiers that are easy to mix up and costly to get wrong: tenant IDs in a multi-tenant platform, money in cents versus dollars, sanitised versus raw HTML.

### Function overloads or a union parameter? {deep}

Overloads let the return type depend on the argument: `findRuns(id: string): Run | undefined` and `findRuns(ids: string[]): Run[]`. Callers see only the overload signatures, and the implementation must handle all of them. A union parameter with a single return type is simpler when the result does not change shape. Often a generic with a lookup type (`get<K extends keyof Settings>(key: K): Settings[K]`) replaces a pile of overloads and scales better. Overloads are erasable, so they work with Node type stripping.

### Which compiler flags do you turn on beyond strict?

`strict` first: it includes `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes` and `useUnknownInCatchVariables`, and it is on by default since TypeScript 6.0. Then `noUncheckedIndexedAccess`, so `array[i]` and `record[key]` include `undefined`, which catches a whole class of runtime crashes. `exactOptionalPropertyTypes` distinguishes "missing" from "explicitly undefined". `noImplicitOverride` makes overriding a method explicit. And `verbatimModuleSyntax` + `isolatedModules` + `erasableSyntaxOnly`, so every file can be transpiled alone by Vite, esbuild or Node.

On an existing codebase I would turn them on one at a time, fixing or suppressing errors per directory, with the type-check running in CI.

### How do you keep front-end types in sync with a Python or Node backend?

Generate them instead of writing them. With FastAPI, the OpenAPI document comes free; `openapi-typescript` turns it into types and `openapi-fetch` gives a typed client, and the CI type-check fails when the backend changes a contract. With a Node backend in the same monorepo, share zod schemas or use tRPC. For gRPC, generate from the `.proto` files. In every case, still validate responses that matter at runtime, because a deployed backend can be newer or older than the client.

### What does strictFunctionTypes check, and where is TypeScript unsound? {deep}

It checks function parameter types **contravariantly**: you cannot pass a handler that accepts only `TokenEvent` where a handler for any `StreamEvent` is expected, because it would receive events it does not understand. Two known unsound spots remain by design: **method-shorthand** signatures in interfaces are still bivariant, and **mutable arrays are covariant** (a `Dog[]` can be treated as `Animal[]` and then have a `Cat` pushed in). Use property syntax for callbacks, `readonly` arrays for inputs, and avoid `as` and `any`, the other big sources of unsoundness.

### What is TypeScript 7, and how does Node run TypeScript now?

TypeScript 7 is the compiler ported to native code in Go. Microsoft reports full builds around 10× faster and faster editor responsiveness; the type system and language are the same as 6.0. Version 6.0 was the bridge: new defaults such as `strict` on and an empty `types` list, plus deprecations (ES5 target, node10 resolution, `baseUrl`, `outFile`) that are errors in 7.0.

Separately, Node runs `.ts` files directly by **type stripping**: it replaces annotations with whitespace, does no type checking, and ignores `tsconfig.json`. It is stable from Node 25.2 and 24.12 and has run unflagged since 22.18. It only handles erasable syntax, which is why `erasableSyntaxOnly` and union literals instead of enums matter. Type-checking still happens in `tsc` (in CI and the editor).

### What does an excess property check catch, and when does it not apply? {deep}

When you pass a **fresh object literal** where a type is expected, TypeScript reports properties the type does not declare, which catches typos such as `{ nmae: 'x' }` or a misspelled option name. It does not apply once the object is stored in a variable first, because then it is just a wider value that still has the required shape. If you need that strictness everywhere, model it with exact schemas at the boundary (zod objects strip unknown keys by default, and `z.strictObject` rejects them).

## Coding problems

### Write a Result type and an attempt() helper {easy core}

Write a `Result<T, E>` type that is either a success with a `value` or a failure with an `error`, and an async `attempt(fn)` that runs a promise-returning function and never throws: it returns a `Result`. Callers must check `ok` before they can touch `value`.

```text
await attempt(async () => 42)                    → { ok: true, value: 42 }
await attempt(async () => { throw new Error('x') }) → { ok: false, error: Error('x') }
```

#### Hints

1. Model it as a discriminated union on a boolean `ok` field.
2. The `catch` variable is `unknown`. Decide how to turn a non-`Error` throw into an `Error`.
3. A small `unwrapOr(result, fallback)` helper shows that narrowing works.

#### Solution

A discriminated union on `ok` forces callers to narrow before reading `value` or `error`. `attempt` catches everything and normalises non-`Error` throws, because JavaScript can throw a string or an object.

```ts
import assert from 'node:assert/strict';

type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

function unwrapOr<T>(result: Result<T>, fallback: T): T {
  return result.ok ? result.value : fallback; // value only exists on the ok branch
}

const good = await attempt(async () => 42);
const bad = await attempt(async (): Promise<number> => {
  throw new Error('quota exceeded');
});
const weird = await attempt(async (): Promise<number> => {
  throw 'a string';
});

assert.deepEqual(good, { ok: true, value: 42 });
assert.equal(bad.ok, false);
if (!bad.ok) assert.equal(bad.error.message, 'quota exceeded');
if (!weird.ok) assert.equal(weird.error.message, 'a string');
assert.equal(unwrapOr(bad, 0), 0);
assert.equal(unwrapOr(good, 0), 42);

function typeTests(r: Result<number>) {
  // @ts-expect-error value is not available until ok has been checked
  return r.value;
}
void typeTests;
```

Complexity: O(1) overhead around the wrapped call.

#### Follow-ups

- **Why not just throw?** Results make failure part of the type, so callers cannot forget it. Throwing is fine for truly exceptional cases, and libraries usually mix both.
- **Add timeouts.** Accept an `AbortSignal` or a `timeoutMs` and race the function against a timer; see [Async problems](#/code-async).

### Build a type-safe event emitter {medium core}

Write an `Emitter<E>` class where `E` maps event names to payload types. `on(name, handler)` must only accept known names, and the handler's parameter must be that event's payload type. `on` returns an unsubscribe function, and `emit(name, payload)` checks the payload type.

```text
type RunEvents = { 'run.started': { runId: string }; 'step.finished': { step: string; ms: number } };
emitter.on('step.finished', (e) => e.ms)   // e is { step: string; ms: number }
emitter.emit('run.started', { runId: 1 })  // compile error: runId must be a string
```

#### Hints

1. Make the methods generic over `K extends keyof E`, and type the payload as `E[K]`.
2. Store handlers in a mapped type: `{ [K in keyof E]?: Array<(payload: E[K]) => void> }`.
3. Return a closure that removes exactly the handler that was added.

#### Solution

The class is generic over the event map. Each method takes `K extends keyof E`, so the name picks the payload type through the lookup `E[K]`. Handlers live in a mapped type keyed by event name.

```ts
import assert from 'node:assert/strict';

class Emitter<E extends Record<string, unknown>> {
  #handlers: { [K in keyof E]?: Array<(payload: E[K]) => void> } = {};

  on<K extends keyof E>(name: K, handler: (payload: E[K]) => void): () => void {
    (this.#handlers[name] ??= []).push(handler);
    return () => {
      this.#handlers[name] = this.#handlers[name]?.filter((h) => h !== handler);
    };
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    // Copy first, so a handler that unsubscribes during emit does not skip the next one.
    for (const handler of [...(this.#handlers[name] ?? [])]) handler(payload);
  }
}

type RunEvents = {
  'run.started': { runId: string };
  'step.finished': { runId: string; step: string; ms: number };
};

const emitter = new Emitter<RunEvents>();
const seen: string[] = [];
const off = emitter.on('step.finished', (e) => seen.push(`${e.step}:${e.ms}`));
emitter.on('run.started', (e) => seen.push(`start:${e.runId}`));

emitter.emit('run.started', { runId: 'r1' });
emitter.emit('step.finished', { runId: 'r1', step: 'plan', ms: 120 });
off();
emitter.emit('step.finished', { runId: 'r1', step: 'act', ms: 300 });

assert.deepEqual(seen, ['start:r1', 'plan:120']);

function typeTests() {
  // @ts-expect-error unknown event name
  emitter.on('run.exploded', () => {});
  // @ts-expect-error runId must be a string
  emitter.emit('run.started', { runId: 1 });
}
void typeTests;
```

Complexity: `on` is O(1); `emit` and unsubscribe are O(h) for h handlers of that event.

#### Follow-ups

- **`once`?** Wrap the handler in one that calls the unsubscribe function before forwarding.
- **Error isolation?** Wrap each handler call in try/catch so one failing listener does not stop the others.
- **Node already has EventEmitter.** Yes; this exercise shows how its typings can be made safe, which `@types/node` now supports with a generic event map.

### Extract route parameters with template literal types {medium}

Write a type `PathParams<P>` that turns a route pattern such as `'/runs/:runId/steps/:stepId'` into `{ runId: string; stepId: string }`, and a `buildPath(pattern, params)` function that requires exactly those params and URL-encodes them.

```text
buildPath('/runs/:runId/steps/:stepId', { runId: 'r 1', stepId: 's2' }) → '/runs/r%201/steps/s2'
buildPath('/runs/:runId', {})                                         → compile error
```

#### Hints

1. Split the job in two: first compute a union of parameter names, then turn that union into an object type.
2. A conditional type with template literal inference can peel off one `:name/` segment and recurse on the rest of the string. The last segment has no trailing slash, so it needs its own pattern.
3. A mapped type over the union of names gives the object: `{ [K in ParamNames<P>]: string }`.

#### Solution

A recursive conditional type peels one `:name` segment at a time. A mapped type then turns the union of names into the required object. At runtime a regex replaces each `:name`.

```ts
import assert from 'node:assert/strict';

type ParamNames<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | ParamNames<Rest>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

type PathParams<P extends string> = { [K in ParamNames<P>]: string };

function buildPath<P extends string>(pattern: P, params: PathParams<P>): string {
  const values: Record<string, string> = params;
  return pattern.replace(/:(\w+)/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Missing param ${name}`);
    return encodeURIComponent(value);
  });
}

assert.equal(buildPath('/runs/:runId/steps/:stepId', { runId: 'r 1', stepId: 's2' }), '/runs/r%201/steps/s2');
assert.equal(buildPath('/health', {}), '/health');

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
export type Tests = [
  Expect<Equal<ParamNames<'/runs/:runId/steps/:stepId'>, 'runId' | 'stepId'>>,
  Expect<Equal<ParamNames<'/health'>, never>>,
];

function typeTests() {
  // @ts-expect-error stepId is missing
  buildPath('/runs/:runId/steps/:stepId', { runId: 'r1' });
}
void typeTests;
```

Complexity: O(n) in the length of the path at runtime; the type is computed at compile time.

#### Follow-ups

- **Optional params like `:id?`?** Add a branch that matches a trailing `?` and maps those names to optional properties.
- **Where is this used for real?** Typed routers (TanStack Router, React Router's type generation) and typed API clients do exactly this.

### Write DeepReadonly and DeepPartial {medium}

Write `DeepReadonly<T>`, which makes every nested property and array readonly, and `DeepPartial<T>`, which makes every nested property optional. Functions must be left alone. Prove both with type-level tests.

#### Hints

1. Start from a mapped type over `keyof T`, and recurse on `T[K]`.
2. Use a conditional type to treat functions and primitives as leaves.
3. Arrays need their own branch: map `readonly (infer U)[]` to `ReadonlyArray<DeepReadonly<U>>`.

#### Solution

A conditional type decides the case: functions are left alone, arrays map their element type, objects recurse with a mapped type, and primitives fall through unchanged.

```ts
import assert from 'node:assert/strict';

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

type RunConfig = {
  model: { name: string; temperature: number };
  tools: { name: string; allowed: boolean }[];
  onEvent: (e: string) => void;
};

function mergeConfig(base: RunConfig, patch: DeepPartial<RunConfig>): RunConfig {
  return {
    ...base,
    ...patch,
    model: { ...base.model, ...patch.model },
    tools: (patch.tools as RunConfig['tools'] | undefined) ?? base.tools,
  };
}

const base: RunConfig = { model: { name: 'gemini', temperature: 0.2 }, tools: [], onEvent: () => {} };
const merged = mergeConfig(base, { model: { temperature: 0 } });
assert.deepEqual(merged.model, { name: 'gemini', temperature: 0 });

const frozen: DeepReadonly<RunConfig> = base;

function typeTests() {
  // @ts-expect-error nested properties are readonly
  frozen.model.temperature = 1;
  // @ts-expect-error nested arrays are readonly
  frozen.tools.push({ name: 'x', allowed: true });
}
void typeTests;
```

Complexity: compile-time only. Deep recursive types can slow the checker on very large types, so keep them for configuration and state.

#### Follow-ups

- **Is `DeepReadonly` enough to stop mutation?** No: it is compile-time only. Use `Object.freeze` recursively (or Immer, which freezes in development) for runtime protection.
- **Why not apply it to `Date` or `Map`?** Those are objects with methods. Add special cases, or leave them as leaves, depending on the use.
