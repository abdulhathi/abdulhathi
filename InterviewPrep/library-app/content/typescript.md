---
title: TypeScript in depth, and typing React
goal: Explain and write the TypeScript a senior full-stack engineer is expected to know (narrowing, discriminated unions, generics, conditional and mapped types, runtime validation with zod), type React components, forms and a backend API client, and say how TypeScript is compiled and run today.
minutes: 75
---

A senior React and Node role assumes TypeScript fluency, so interviewers test the parts that separate fluent users from people who annotate variables: **narrowing**, **discriminated unions** with exhaustive checks, **generics** with constraints, **conditional and mapped types**, and the difference between compile-time types and **runtime validation**. On an agent platform, almost everything that crosses a boundary has several shapes: a stream event can be a token, a tool call or an error, and an agent run can be queued, running, waiting for approval, or finished. Unions model that, and the compiler then checks that every case is handled. The second half applies all of it to React: props, events and refs, generic components, forms, and a typed client for calling a backend.

**Your angle:** your resume lists TypeScript with React at Medidata, React at The Dot Corp, and Node.js. On the Document AI platform at Quantiphi you used **Pydantic schemas as a data contract** on extracted fields. zod plays exactly that role in TypeScript: one schema gives you both the static type and the runtime check.

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

A **discriminated union** is a union of object types that share a literal property (the discriminant, here `type` or `status`). Switching on it narrows each branch, and a `never` check at the end turns "I forgot a case" into a compile error. It is the most useful pattern in this chapter for apps that consume event streams or model workflow states.

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

## Typing React components

Type the props parameter directly (`function Badge({ label }: BadgeProps)`). `React.FC` is optional and many teams avoid it; React 18's types already stopped adding an implicit `children` to it.

### Props, children and native attributes

```tsx
import type { ComponentProps, ReactNode } from 'react';

// A type alias (or interface) for props; optional props get defaults in the destructuring.
type BadgeProps = {
  label: string;
  tone?: 'neutral' | 'success' | 'danger';
  icon?: ReactNode; // anything renderable: elements, strings, numbers, null, arrays
};

export function Badge({ label, tone = 'neutral', icon }: BadgeProps) {
  return (
    <span className={`badge ${tone}`}>
      {icon}
      {label}
    </span>
  );
}

// Extend a native element: every <button> prop (onClick, disabled, type, aria-*) is accepted and typed.
type ButtonProps = ComponentProps<'button'> & { variant?: 'primary' | 'ghost' };

export function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  return <button className={`btn ${variant} ${className ?? ''}`} {...rest} />;
}

export function Toolbar({ children }: { children: ReactNode }) {
  // A plain container: role="toolbar" would promise arrow-key navigation (see the accessibility chapter).
  return <div className="toolbar">{children}</div>;
}

export const Example = () => (
  <Toolbar>
    <Badge label="Denied" tone="danger" />
    <Button type="submit" disabled>
      Appeal
    </Button>
  </Toolbar>
);
```

In React 19, `ref` is an ordinary prop, so it passes through `...rest` without `forwardRef`. Use `Omit<ComponentProps<'input'>, 'onChange'>` when you replace a native prop with a differently typed one.

### Events, state and refs

```tsx
import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';

type Contact = { id: string; name: string };

export function ContactForm({ onSave }: { onSave: (name: string) => void }) {
  const [name, setName] = useState(''); // inferred as string
  const [saved, setSaved] = useState<Contact | null>(null); // a union needs an explicit type
  const inputRef = useRef<HTMLInputElement>(null); // React 19 types: RefObject<HTMLInputElement | null>

  const onChange = (e: ChangeEvent<HTMLInputElement>) => setName(e.target.value);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setName('');
  };
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return inputRef.current?.focus();
    onSave(name.trim());
    setSaved({ id: crypto.randomUUID(), name: name.trim() });
  };

  return (
    <form onSubmit={onSubmit}>
      <input ref={inputRef} value={name} onChange={onChange} onKeyDown={onKeyDown} aria-label="Contact name" />
      <button type="submit">Save</button>
      {saved && <p>Last saved: {saved.name}</p>}
    </form>
  );
}
```

### Async state as a discriminated union

The same pattern as the stream events above, applied to fetched data. Separate flags (`isLoading`, `error`, `data`) allow impossible combinations such as "loading and failed at once"; a union tagged by `status` makes them unrepresentable, and each branch is narrowed.

```tsx
import { useEffect, useState } from 'react';

type Order = { id: string; status: 'paid' | 'refused' | 'pending'; amount: number };

type RemoteData<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

export function OrderSummary({ id }: { id: string }) {
  const [state, setState] = useState<RemoteData<Order>>({ status: 'idle' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetch(`/api/orders/${id}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setState({ status: 'success', data: (await r.json()) as Order });
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: e instanceof Error ? e.message : 'Unknown error' });
      });
    return () => controller.abort();
  }, [id]);

  switch (state.status) {
    case 'idle':
    case 'loading':
      return <p>Loading…</p>;
    case 'error':
      return <p role="alert">{state.message}</p>;
    case 'success':
      return <p>{state.data.id}: {state.data.status} (${state.data.amount.toFixed(2)})</p>; // data is typed here
  }
}
```

TanStack Query returns the same shape (`status: 'pending' | 'error' | 'success'` with typed `data` and `error`), which is one reason to prefer it over hand-written effects; see [State and client caching](#/react-state).

### Generic components

```tsx
import type { ReactNode } from 'react';

type Column<T> = { header: string; render: (row: T) => ReactNode };

// T is inferred from `rows`, so `render` gets a correctly typed row.
export function DataTable<T extends { id: string }>({ rows, columns }: { rows: T[]; columns: Column<T>[] }) {
  return (
    <table>
      <thead>
        <tr>{columns.map((c) => <th key={c.header}>{c.header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>{columns.map((c) => <td key={c.header}>{c.render(row)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

type Member = { id: string; name: string; plan: 'Basic' | 'Plus' | 'Enterprise' };

export const Members = ({ members }: { members: Member[] }) => (
  <DataTable
    rows={members}
    columns={[
      { header: 'Name', render: (m) => m.name },
      { header: 'Plan', render: (m) => m.plan },
    ]}
  />
);
```

## Forms and validation

| Approach | Use when |
|---|---|
| Controlled inputs + a pure `validate()` function | Small forms with live feedback |
| React 19 `<form action>` + `useActionState` | Submit-time validation, server round trips, progressive enhancement |
| react-hook-form + a zod schema | Large forms: uncontrolled inputs for performance, one schema for both the type and the validation |

Always validate on the server too (FastAPI with Pydantic, or an Express handler with zod, rejects bad input with field-level details). Client validation is for user experience, not security.

```tsx
import { useRef, useState, type FormEvent } from 'react';

type Values = { memberId: string; dob: string; email: string };
type Errors = Partial<Record<keyof Values, string>>;
const FIELDS: (keyof Values)[] = ['memberId', 'dob', 'email'];

export function validate(v: Values, today = new Date()): Errors {
  const errors: Errors = {};
  if (!/^[A-Z]{2}\d{6}$/.test(v.memberId)) errors.memberId = 'Two capital letters followed by six digits';
  if (!v.dob || new Date(v.dob) > today) errors.dob = 'Date of birth must be in the past';
  if (!/^\S+@\S+\.\S+$/.test(v.email)) errors.email = 'Enter a valid email';
  return errors;
}

export function EligibilityForm({ onSubmit }: { onSubmit: (v: Values) => void }) {
  const [values, setValues] = useState<Values>({ memberId: '', dob: '', email: '' });
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const inputs = useRef<Partial<Record<keyof Values, HTMLInputElement | null>>>({});
  const errors = validate(values); // derived during render, not stored in state

  const field = (name: keyof Values, label: string, type = 'text') => {
    const error = touched[name] ? errors[name] : undefined;
    return (
      <div>
        <label htmlFor={name}>{label}</label>
        <input
          id={name}
          ref={(el) => {
            inputs.current[name] = el;
          }}
          type={type}
          value={values[name]}
          onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
          onBlur={() => setTouched((t) => ({ ...t, [name]: true }))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${name}-error` : undefined}
        />
        {error && <p id={`${name}-error`}>{error}</p>}
      </div>
    );
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTouched({ memberId: true, dob: true, email: true });
    const firstInvalid = FIELDS.find((f) => errors[f]);
    if (firstInvalid) inputs.current[firstInvalid]?.focus(); // take keyboard and screen-reader users to the problem
    else onSubmit(values);
  };

  return (
    <form onSubmit={submit} noValidate>
      {field('memberId', 'Member ID')}
      {field('dob', 'Date of birth', 'date')}
      {field('email', 'Email', 'email')}
      <button type="submit">Check eligibility</button>
    </form>
  );
}
```

Errors are derived from the values on every render instead of being stored, so they can never disagree with what is typed. The ref callback uses a block body because React 19 treats a returned value as a cleanup function. For long forms, add an error summary at the top that links to each field; the [accessibility chapter](#/a11y-ui) shows the full pattern.

## Calling a backend from React

Keep `fetch` calls out of components: one small typed client builds the URL, adds the token, applies a timeout, checks `res.ok` (fetch only rejects on network failures, never on 4xx or 5xx), and turns the backend's error shapes into one typed error. The example maps FastAPI's 422 validation details onto form fields; another backend needs a different mapping in the same place.

```ts
import assert from 'node:assert/strict';

// FastAPI answers 422 with {"detail": [{"loc": ["body", "email"], "msg": "...", "type": "..."}]} for
// validation errors, and {"detail": "message"} for HTTPException.
type ValidationItem = { loc: (string | number)[]; msg: string; type: string };

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string>;
  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

type RequestOptions = RequestInit & { token?: string; timeoutMs?: number };

export function createApi(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  return async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { token, timeoutMs = 10_000, headers, signal, ...rest } = options;
    // new Headers() accepts every HeadersInit shape; spreading a Headers object or tuples would lose them.
    const h = new Headers(headers);
    if (typeof rest.body === 'string' && !h.has('Content-Type')) h.set('Content-Type', 'application/json');
    if (token) h.set('Authorization', `Bearer ${token}`);
    // Keep the timeout even when the caller passes its own signal (TanStack Query and unmount cleanup do).
    const timeout = AbortSignal.timeout(timeoutMs);
    const res = await fetchImpl(`${baseUrl}${path}`, { ...rest, headers: h, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });

    if (res.status === 204) return undefined as T;
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = (body as { detail?: unknown } | null)?.detail;
      if (res.status === 422 && Array.isArray(detail)) {
        const fieldErrors: Record<string, string> = {};
        for (const item of detail as ValidationItem[]) {
          // ["body", "address", "zip"] → "address.zip"; an error on the whole body (loc ["body"]) is form-level.
          const field = item.loc.slice(1).join('.') || '_form';
          fieldErrors[field] ??= item.msg; // keep the first message per field
        }
        throw new ApiError(422, 'Please fix the highlighted fields', fieldErrors);
      }
      throw new ApiError(res.status, typeof detail === 'string' ? detail : `Request failed (${res.status})`);
    }
    // A cast trusts the server. For data you do not control, parse with a zod schema here instead.
    return body as T;
  };
}

// In a Vite app: export const api = createApi(import.meta.env.VITE_API_URL ?? '/api');

// Tests with a fake fetch that replays canned responses.
const sent: { url: string; headers: Headers }[] = [];
function fakeFetch(responses: Response[]): typeof fetch {
  return async (input, init) => {
    sent.push({ url: String(input), headers: new Headers(init?.headers) });
    const next = responses.shift();
    if (!next) throw new Error('no more canned responses');
    return next;
  };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Contact = { id: string; email: string };
const api = createApi('/api', fakeFetch([
  json(201, { id: 'c1', email: 'ana@example.com' }),
  json(422, { detail: [{ loc: ['body', 'email'], msg: 'value is not a valid email address', type: 'value_error' }] }),
  json(404, { detail: 'Contact not found' }),
  new Response(null, { status: 204 }),
  json(422, { detail: [
    { loc: ['body'], msg: 'JSON decode error', type: 'json_invalid' },
    { loc: ['body', 'address', 'zip'], msg: 'String should have at least 5 characters', type: 'string_too_short' },
    { loc: ['body', 'address', 'zip'], msg: 'String should match pattern', type: 'string_pattern_mismatch' },
  ] }),
]));

const created = await api<Contact>('/contacts', {
  method: 'POST',
  body: JSON.stringify({ email: 'ana@example.com' }),
  token: 't0k',
  headers: [['X-Request-Id', 'r-1']], // a tuple list survives
});
assert.equal(created.id, 'c1');
assert.equal(sent[0].url, '/api/contacts');
assert.equal(sent[0].headers.get('Authorization'), 'Bearer t0k');
assert.equal(sent[0].headers.get('Content-Type'), 'application/json');
assert.equal(sent[0].headers.get('X-Request-Id'), 'r-1');

await assert.rejects(api('/contacts', { method: 'POST', body: '{}' }), (e: unknown) =>
  e instanceof ApiError && e.status === 422 && e.fieldErrors.email === 'value is not a valid email address');
await assert.rejects(api('/contacts/zz'), { name: 'ApiError', message: 'Contact not found' });
assert.equal(await api('/contacts/c1', { method: 'DELETE' }), undefined);
assert.equal(sent[3].headers.has('Content-Type'), false); // no body, so no JSON header
await assert.rejects(api('/contacts', { method: 'POST', body: '{' }), (e: unknown) =>
  e instanceof ApiError && e.fieldErrors._form === 'JSON decode error' && e.fieldErrors['address.zip'] === 'String should have at least 5 characters');

// The timeout still applies when the caller passes a signal, and the caller can still cancel.
const hanging: typeof fetch = (_input, init) =>
  new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true }));
const slow = createApi('/api', hanging);
const keepAlive = setInterval(() => {}, 1000); // AbortSignal.timeout's timer does not keep Node alive on its own
try {
  await assert.rejects(slow('/slow', { timeoutMs: 20, signal: new AbortController().signal }), { name: 'TimeoutError' });
  const cancel = new AbortController();
  const pending = slow('/slow', { signal: cancel.signal });
  cancel.abort();
  await assert.rejects(pending, { name: 'AbortError' });
} finally {
  clearInterval(keepAlive);
}
```

Components call the client through TanStack Query or a custom hook, which adds caching, retries and loading states. Three things that come up next:

- **Environment variables:** Vite exposes only `VITE_`-prefixed variables on `import.meta.env`, and **inlines them into the bundle at build time**, so they are public. Never put API keys or client secrets there; keep secrets on the server.
- **CORS:** in development, proxy the API through the Vite dev server (`server.proxy: { '/api': 'http://localhost:8000' }`) so it is same-origin. In production, serve both from one origin behind a reverse proxy, or allow an explicit list of origins on the server. CORS is fixed on the server, never in React; see [web security](#/web-security).
- **Where the token lives:** an httpOnly cookie or a backend-for-frontend keeps tokens away from injected scripts; see [identity](#/auth-identity).

**Your angle:** your resume lists React with TypeScript at Medidata, React at The Dot Corp, JWT/OAuth2 at Medidata, and a FastAPI backend at Quantiphi, where the Pydantic models were the contract. A typed client that mirrors those models, with error handling and auth in one place, is the React side of the same idea.

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

A small detail: interfaces with `extends` report conflicting members as errors, while intersections of conflicting types quietly produce `never` properties. For React props, type the parameter directly; `React.FC` is optional and no longer adds `children` implicitly.

### What is the difference between any, unknown and never? {core}

`any` disables type checking for that value, and the looseness spreads to everything it touches. `unknown` is the safe top type: it can hold anything, but you must narrow it (`typeof`, `instanceof`, a type guard, a schema parse) before using it. `never` is the empty type: the type of a value that cannot exist, a function that always throws, or the leftover after every union member is handled.

I use `unknown` for anything external (parsed JSON, `catch` variables, messages from a socket), `never` for exhaustiveness checks, and `any` only at an unavoidable seam, with a comment.

### How does narrowing work, and what are type predicates and assertion functions? {core}

TypeScript follows control flow: after `typeof x === 'string'`, `'error' in res`, `e instanceof HttpError`, `x != null` or a discriminant check, it narrows the union to the members still possible in that branch. A **type predicate** (`function isToolCall(e): e is ToolCallEvent`) is a user-defined check that narrows the caller's variable when it returns true. An **assertion function** (`asserts value is NonNullable<T>`) narrows after the call returns and throws otherwise, which suits validation at the top of a function.

The caveat: predicates are trusted, not verified, so a wrong predicate lies to the compiler. Keep them small, or derive them from a schema. Since TypeScript 5.5, simple arrow functions like `x => x !== undefined` infer a predicate automatically, so `filter` returns the narrowed array type.

### What is a discriminated union, and how do you make a switch exhaustive? {core}

A union of object types that share a literal property such as `type` or `status`. Checking that property narrows to one member, so each `case` sees only the fields that member has. For exhaustiveness, end the switch with `default: return assertNever(ev)`, where `assertNever` takes a `never` parameter. If a new member is added and not handled, the leftover type is no longer `never` and the code stops compiling.

I use this for stream events (token, tool call, tool result, approval required, error, done) and for agent run states, so "succeeded with an error" or "running without a step" simply cannot be represented.

In React the same idea models fetch state: `idle | loading | success (with data) | error (with a message)`, so impossible combinations such as loading with an error cannot exist, and only the success branch can touch `data`.

### How would you type the events coming down an SSE or WebSocket stream? {core}

As a discriminated union on a `type` field, with one member per event and only the fields that event carries. The reducer that folds events into UI state switches on `type` with an exhaustive check. Because the data arrives as untrusted JSON, I define the union as a **zod discriminated union** and infer the TypeScript type from it, so every message is validated once at the socket boundary, and malformed or unknown messages are logged and dropped instead of crashing a component.

For evolution, the server should add new event types rather than change existing ones, and the client should ignore unknown types (log, then skip) so old clients keep working during a rollout.

### When do you use generics, and what do constraints do? {core}

When a type needs to **flow through**: the output relates to the input (`indexBy<T>(items: T[]) => Record<K, T>`), or two inputs must agree (`get<K extends keyof Settings>(key: K): Settings[K]`). A constraint (`K extends keyof T`, `T extends { id: string }`) states what the type must support, so the body can use it safely. TypeScript normally infers the type arguments from the call.

Anti-patterns: a type parameter used once (just use the concrete type), or a generic return type the caller must assert (`fetchJson<T>()` returning unvalidated data is an `as` cast in disguise; pass a schema instead).

### How do you type children: ReactNode, ReactElement or JSX.Element? {core}

Use `ReactNode` for anything React can render: elements, strings, numbers, `null`, `undefined`, booleans, arrays and portals. That is the right type for a `children` prop in almost every case. `ReactElement` (or `JSX.Element`) is narrower: a single element produced by JSX, not a string or `null`. Use it only when you need to inspect or clone the element, for example a component that requires exactly one element child.

`PropsWithChildren<P>` adds `children?: ReactNode` to a props type, which is handy for wrappers.

### How do you type event handlers in React? {core}

Use React's event types with the element as the type parameter: `ChangeEvent<HTMLInputElement>` for inputs, `FormEvent<HTMLFormElement>` for submit, `MouseEvent<HTMLButtonElement>` for clicks, `KeyboardEvent<HTMLInputElement>` for keys. If you write the handler inline (`onChange={(e) => setName(e.target.value)}`), TypeScript infers the type from the prop, so no annotation is needed. For props that accept handlers, type them by intent: `onSave: (contact: Contact) => void`.

React's `MouseEvent` and the DOM's `MouseEvent` are different types; import React's from `'react'`.

### How do you build a component that accepts all the props of a native element?

Intersect your props with `ComponentProps<'button'>` (or `ComponentPropsWithoutRef<'button'>`), destructure your own props, and spread the rest onto the element: `function Button({ variant, ...rest }: ComponentProps<'button'> & { variant?: 'primary' }) { return <button {...rest} />; }`. Callers then get type-checked `onClick`, `disabled`, `type`, `aria-*` and so on. In React 19, `ref` is a normal prop, so it passes through the spread without `forwardRef`.

Use `Omit<ComponentProps<'input'>, 'onChange'>` when you replace a native prop with a differently typed one.

### How do you type useRef, and why is null involved? {deep}

For DOM refs, `useRef<HTMLInputElement>(null)`: the element does not exist during the first render, so the ref starts as `null` and React fills it after mounting. In React 19's types this is a `RefObject<HTMLInputElement | null>`, so you access it with `inputRef.current?.focus()`. For mutable values that are not DOM nodes (a timer ID), use `useRef<number | undefined>(undefined)` and assign to `.current` freely. React 19's types require an argument for `useRef`.

### How do you write a generic React component? {deep}

Declare the type parameter on the function and let it flow through the props: `function DataTable<T extends { id: string }>({ rows, columns }: { rows: T[]; columns: Column<T>[] })`. TypeScript infers `T` from `rows`, so each column's `render(row)` receives a correctly typed row, and a typo like `row.nmae` is a compile error. Use generics for reusable list, table, select and autocomplete components, where the item type differs per use. The constraint (`extends { id: string }`) guarantees a stable key.

### How do you validate forms in React? {core}

It depends on size. For a small form, controlled inputs plus a pure `validate(values)` function called during render, showing errors once a field is touched. For submit-time validation and server round trips, React 19 form Actions with `useActionState` return errors as state. For large forms, react-hook-form (uncontrolled inputs, so typing does not re-render the whole form) with a zod schema, which gives you both the TypeScript type and the runtime validation from one definition.

Two points that impress: accessibility (associate errors with `aria-describedby`, mark fields `aria-invalid`, move focus to the first error) and **always re-validating on the server**, then mapping the server's field errors back onto the form.

### How do you call a backend API from React? {core}

Through one small API module instead of `fetch` calls scattered through components. It builds the URL from an environment variable, sets JSON headers and the `Authorization: Bearer` token, applies a timeout or abort signal, checks `res.ok` (fetch only rejects on network errors, not on 4xx or 5xx), parses the backend's error shapes (for FastAPI, 422 validation details and `{"detail": "..."}` from `HTTPException`), and returns typed data. Components call it through TanStack Query or a hook, which adds caching, retries and loading states.

**Your angle:** the Document AI platform paired a FastAPI backend with an Angular SSR front end; the same principles apply in React: typed contracts that mirror the Pydantic models, central error handling, and auth handled in one place.

### How do you show server-side validation errors, such as FastAPI's 422, in a form? {deep}

FastAPI returns status 422 with `{"detail": [{"loc": ["body", "email"], "msg": "...", "type": "..."}]}`, one item per failing field. The API client maps each item's `loc` (dropping the `"body"` prefix) to the form field name and its `msg` to the message, then throws a typed error carrying `fieldErrors`. The form shows those next to the fields and moves focus to the first one. For `HTTPException` errors, `detail` is a string you show as a general message. Keep client and server field names identical, or generate TypeScript types from the OpenAPI schema (`openapi-typescript`) so they cannot drift.

### How do environment variables work in a Vite React app?

Vite exposes variables from `.env`, `.env.development`, `.env.production` (and the real environment) on `import.meta.env`, but only those prefixed with `VITE_`, for example `import.meta.env.VITE_API_URL`. They are **inlined into the JavaScript bundle at build time**, so anything in them is public. Never put secrets (API keys, client secrets) in front-end variables; keep them on the server and call the server instead. Built-ins include `import.meta.env.MODE`, `DEV` and `PROD`.

### Which utility types do you use most in React code? {deep}

`Partial<T>` (form drafts, PATCH bodies), `Pick<T, K>` and `Omit<T, K>` (derive a component's props from a model), `Record<K, V>` (maps such as field → error message), `ReturnType<typeof fn>` and `Awaited<T>` (types from functions, for example a Redux `RootState`), `ComponentProps<typeof Comp>` (the props of an existing component), `NonNullable<T>`, and `as const` for literal tuples. Template literal types help with route paths or event names.

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
