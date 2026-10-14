---
title: React with TypeScript, forms, testing and APIs
goal: Type React components and state confidently, build validated forms, call a FastAPI backend safely, and test components the way React Testing Library intends.
minutes: 45
---

A full-stack Python and React role means the interviewer will care about the seam between the two: typed props and state on the front end, forms that validate, a fetch layer that handles errors and auth, CORS, and tests that give confidence. This chapter covers the TypeScript patterns you will be asked to write, plus the practical questions about calling FastAPI from React.

**Your angle:** your resume lists React with TypeScript (Medidata, The Dot Corp), JWT/OAuth2 authentication, React Testing Library, Jest and Cypress, and FastAPI backends (Quantiphi). Connect answers to those.

## Typing props, children and native attributes

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
  return <div role="toolbar">{children}</div>;
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

## Typing events, state and refs

```tsx
import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';

type Patient = { id: string; name: string };

export function PatientForm({ onSave }: { onSave: (name: string) => void }) {
  const [name, setName] = useState(''); // inferred as string
  const [selected, setSelected] = useState<Patient | null>(null); // a union needs an explicit type
  const inputRef = useRef<HTMLInputElement>(null); // React 19 types: RefObject<HTMLInputElement | null>

  const onChange = (e: ChangeEvent<HTMLInputElement>) => setName(e.target.value);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setName('');
  };
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return inputRef.current?.focus();
    onSave(name.trim());
    setSelected({ id: crypto.randomUUID(), name: name.trim() });
  };

  return (
    <form onSubmit={onSubmit}>
      <input ref={inputRef} value={name} onChange={onChange} onKeyDown={onKeyDown} aria-label="Patient name" />
      <button type="submit">Save</button>
      {selected && <p>Last saved: {selected.name}</p>}
    </form>
  );
}
```

## Model async state as a discriminated union

Separate booleans (`isLoading`, `error`, `data`) allow impossible combinations such as "loading and error at once". A union with a `status` tag makes them unrepresentable, and TypeScript narrows the type inside each branch.

```tsx
import { useEffect, useState } from 'react';

type Claim = { id: string; status: 'paid' | 'denied' | 'pending'; amount: number };

type RemoteData<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

export function ClaimSummary({ id }: { id: string }) {
  const [state, setState] = useState<RemoteData<Claim>>({ status: 'idle' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetch(`/api/claims/${id}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setState({ status: 'success', data: (await r.json()) as Claim });
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

## Generic components

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

type Member = { id: string; name: string; plan: 'Medicaid' | 'Medicare' | 'Marketplace' };

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
| Controlled inputs + a `validate()` function | Small forms with live feedback |
| React 19 `<form action>` + `useActionState` | Submit-time validation, server round trips, progressive enhancement |
| react-hook-form + a schema library (zod) | Large forms: uncontrolled inputs for performance, one schema shared for types and validation |

Always validate on the server too (FastAPI and Pydantic do this for you); client validation is for user experience, not security.

```tsx
import { useState, type FormEvent } from 'react';

type Values = { memberId: string; dob: string; email: string };
type Errors = Partial<Record<keyof Values, string>>;

export function validate(v: Values): Errors {
  const errors: Errors = {};
  if (!/^[A-Z]{2}\d{6}$/.test(v.memberId)) errors.memberId = 'Two letters followed by six digits';
  if (!v.dob || new Date(v.dob) > new Date()) errors.dob = 'Date of birth must be in the past';
  if (!/^\S+@\S+\.\S+$/.test(v.email)) errors.email = 'Enter a valid email';
  return errors;
}

export function EligibilityForm({ onSubmit }: { onSubmit: (v: Values) => void }) {
  const [values, setValues] = useState<Values>({ memberId: '', dob: '', email: '' });
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const errors = validate(values); // derived during render, not stored in state

  const field = (name: keyof Values, label: string, type = 'text') => (
    <label>
      {label}
      <input
        type={type}
        value={values[name]}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
        onBlur={() => setTouched((t) => ({ ...t, [name]: true }))}
        aria-invalid={Boolean(touched[name] && errors[name])}
        aria-describedby={`${name}-error`}
      />
      <span id={`${name}-error`} role="alert">{touched[name] ? errors[name] : ''}</span>
    </label>
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched({ memberId: true, dob: true, email: true });
    if (Object.keys(errors).length === 0) onSubmit(values);
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

## Calling a FastAPI backend

A small typed client: base URL from Vite env, bearer token, timeouts through `AbortSignal`, and FastAPI's 422 validation errors turned into field messages.

```ts
/// <reference types="vite/client" />

// FastAPI returns 422 with {"detail": [{"type", "loc": ["body", "name"], "msg", "input"}]} for Pydantic errors,
// and {"detail": "message"} for HTTPException.
type ValidationItem = { loc: (string | number)[]; msg: string; type: string };

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string>;
  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'; // only VITE_* variables reach the browser

export async function api<T>(path: string, init: RequestInit & { token?: string; timeoutMs?: number } = {}): Promise<T> {
  const { token, timeoutMs = 10_000, headers, ...rest } = init;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
  });

  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail;
    if (res.status === 422 && Array.isArray(detail)) {
      const fieldErrors: Record<string, string> = {};
      for (const item of detail as ValidationItem[]) fieldErrors[item.loc.slice(1).join('.')] = item.msg;
      throw new ApiError(422, 'Please fix the highlighted fields', fieldErrors);
    }
    throw new ApiError(res.status, typeof detail === 'string' ? detail : `Request failed (${res.status})`);
  }
  return body as T;
}

// Usage:
type Patient = { id: string; name: string };
export const createPatient = (name: string, token: string) =>
  api<Patient>('/patients', { method: 'POST', body: JSON.stringify({ name }), token });
```

In development, avoid CORS entirely by proxying through the Vite dev server (`server.proxy: { '/api': 'http://localhost:8000' }` in `vite.config.ts`). In production, either serve both from one origin behind a reverse proxy, or configure FastAPI's `CORSMiddleware` with an explicit list of allowed origins.

## Testing with React Testing Library

RTL tests components the way a user uses them: find elements by role and label, interact with `user-event`, and assert on what is visible. Avoid testing state or implementation details.

```tsx
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

function MemberLookup() {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState('');
  const lookup = async () => {
    setError(null);
    const res = await fetch(`/api/members/${id}`);
    if (!res.ok) return setError('Member not found');
    const data = (await res.json()) as { name: string };
    setResult(data.name);
  };
  return (
    <div>
      <label>
        Member ID <input value={id} onChange={(e) => setId(e.target.value)} />
      </label>
      <button onClick={lookup}>Look up</button>
      {result && <p>Found {result}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

// RTL cleans up automatically only when the test runner exposes globals; doing it explicitly always works.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows the member name after a successful lookup', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: 'Ana Ruiz' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const user = userEvent.setup();
  render(<MemberLookup />);

  await user.type(screen.getByLabelText('Member ID'), 'MD123456');
  await user.click(screen.getByRole('button', { name: 'Look up' }));

  expect(await screen.findByText('Found Ana Ruiz')).toBeInTheDocument(); // findBy waits for async UI
  expect(fetchMock).toHaveBeenCalledWith('/api/members/MD123456');
});

it('shows an error when the member does not exist', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  const user = userEvent.setup();
  render(<MemberLookup />);
  await user.click(screen.getByRole('button', { name: 'Look up' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Member not found');
  expect(screen.queryByText(/Found/)).not.toBeInTheDocument(); // queryBy returns null instead of throwing
});
```

## Interview questions

### Should props be typed with type or interface? {core}

Both work for props, and the choice matters much less than consistency. `interface` can be extended and merged (declaration merging), which libraries use; `type` can express unions, intersections, mapped and conditional types, which component props often need (`type Props = A | B`, `ComponentProps<'button'> & {...}`). I usually use `type` for props because unions are common, and keep a team convention.

Also mention: `React.FC` is optional and no longer recommended by many teams; typing the props parameter directly is simpler and does not add an implicit `children` (React 18 types already removed that).

### How do you type children? ReactNode, ReactElement or JSX.Element? {core}

Use `ReactNode` for anything React can render: elements, strings, numbers, `null`, `undefined`, booleans, arrays and portals. That is the right type for a `children` prop in almost every case. `ReactElement` (or `JSX.Element`) is narrower: only a single element produced by JSX, not a string or `null`. Use it only when you need to inspect or clone the element, for example a component that requires exactly one element child.

`PropsWithChildren<P>` adds `children?: ReactNode` to your props type, which is handy for wrappers.

### How do you type event handlers? {core}

Use React's event types with the element as a type parameter: `ChangeEvent<HTMLInputElement>` for inputs, `FormEvent<HTMLFormElement>` for submit, `MouseEvent<HTMLButtonElement>` for clicks, `KeyboardEvent<HTMLInputElement>` for keys. If you write the handler inline (`onChange={(e) => setName(e.target.value)}`), TypeScript infers the type from the prop, so you do not need annotations at all. For props that accept handlers, type them by intent: `onSave: (patient: Patient) => void`.

Note that React's `MouseEvent` and the DOM's `MouseEvent` are different types; import React's from `'react'`.

### How do you build a component that accepts all the props of a native element?

Intersect your props with `ComponentProps<'button'>` (or `ComponentPropsWithoutRef<'button'>`), destructure your own props, and spread the rest onto the element: `function Button({ variant, ...rest }: ComponentProps<'button'> & { variant?: 'primary' }) { return <button {...rest} /> }`. Callers then get type-checked `onClick`, `disabled`, `type`, `aria-*` and so on. In React 19, `ref` is a normal prop, so it passes through the spread without `forwardRef`.

Use `Omit<ComponentProps<'input'>, 'onChange'>` when you replace a native prop with a differently typed one.

### How do you type useRef, and why is null involved? {deep}

For DOM refs, `useRef<HTMLInputElement>(null)`: the element does not exist during the first render, so the ref starts as `null` and React fills it after mounting. In React 19's types this is a `RefObject<HTMLInputElement | null>`, so you access it with `inputRef.current?.focus()`. For mutable values that are not DOM nodes (a timer ID), use `useRef<number | undefined>(undefined)` and assign to `.current` freely. React 19's types require an argument for `useRef`.

### Why model async state as a discriminated union?

Separate flags (`isLoading`, `error`, `data`) allow combinations that should never happen, such as loading with stale data and an error at once, and every render has to check them all. A union like `{ status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; message: string }` makes illegal states unrepresentable. TypeScript narrows on `status`, so `data` only exists in the success branch. Add an exhaustiveness check (an explicit return type, or `const unreachable: never = state` in a `default` branch) and the compiler flags any new status you forget to handle.

Libraries follow the same idea: TanStack Query returns `status: 'pending' | 'error' | 'success'` with typed `data` and `error`.

### Write a generic component and explain when generics help. {deep}

A generic component lets the caller's data type flow through: `function DataTable<T extends { id: string }>({ rows, columns }: { rows: T[]; columns: Column<T>[] })`. TypeScript infers `T` from `rows`, so each column's `render(row)` receives a correctly typed row, and a typo like `row.nmae` is a compile error. Use generics for reusable list, table, select and autocomplete components, where the item type differs per use. The constraint (`extends { id: string }`) guarantees a stable key.

### How do you validate forms in React? {core}

It depends on size. For a small form, controlled inputs plus a pure `validate(values)` function called during render, showing errors after a field is touched. For submit-time validation and server round trips, React 19 form Actions with `useActionState` return errors as state. For large forms, react-hook-form (uncontrolled inputs, so typing does not re-render the whole form) with a zod schema, which gives you both the TypeScript type and the runtime validation from one definition.

Two points that impress: accessibility (associate errors with `aria-describedby`, mark fields `aria-invalid`, move focus to the first error) and **always re-validating on the server**: FastAPI with Pydantic returns 422 with field-level details you can map back onto the form.

### How do you call a FastAPI backend from React? {core}

Through one small API module instead of `fetch` calls scattered in components. It builds the URL from an environment variable, sets JSON headers and the `Authorization: Bearer` token, applies a timeout or abort signal, checks `res.ok` (fetch only rejects on network errors, not on 4xx/5xx), parses FastAPI's error shapes (422 validation details, `{"detail": "..."}` from `HTTPException`), and returns typed data. Components call it through TanStack Query or a hook, which adds caching, retries and loading states.

**Your angle:** the Document AI platform paired a FastAPI backend with an Angular SSR front end; the same principles apply in React: typed contracts that mirror the Pydantic models, central error handling, and auth handled in one place.

### What is CORS, and how do you fix a CORS error? {core}

CORS (Cross-Origin Resource Sharing) is the browser rule that blocks JavaScript on one origin (scheme + host + port, such as `http://localhost:5173`) from reading responses from another origin (`http://localhost:8000`) unless the **server** opts in with `Access-Control-Allow-*` headers. For non-simple requests (JSON bodies, `Authorization` headers, PUT/DELETE) the browser first sends an `OPTIONS` preflight.

The fix is on the server, never in the React code: in FastAPI add `CORSMiddleware` with an explicit `allow_origins` list (not `*` when sending credentials), the needed methods and headers. In development, a Vite proxy avoids CORS by making the API look same-origin. CORS is not an authentication mechanism; it only governs what browsers allow.

### Where should a single-page app store its auth token? {core}

The safest common option is an **httpOnly, Secure, SameSite cookie** set by the server: JavaScript cannot read it, so an XSS bug cannot steal it, though you then need CSRF protection (SameSite plus a CSRF token for state-changing requests). Storing a JWT in `localStorage` is simple and common but readable by any injected script. A middle ground is a short-lived access token kept **in memory** plus a refresh token in an httpOnly cookie, or the backend-for-frontend pattern where the browser never sees tokens at all.

Whatever the storage, keep access tokens short-lived, validate them on every API call, and never put PHI in a JWT payload, since it is only base64-encoded, not encrypted.

### How do you show FastAPI validation errors in the UI? {deep}

FastAPI returns status 422 with `{"detail": [{"loc": ["body", "email"], "msg": "...", "type": "..."}]}`, one item per failing field. The API client maps each item's `loc` (dropping the `"body"` prefix) to the form field name and its `msg` to the message, then throws a typed error carrying `fieldErrors`. The form displays those next to the fields. For `HTTPException` errors, `detail` is a string you show as a general message. Keep the client and server field names identical, or generate TypeScript types from FastAPI's OpenAPI schema (`openapi-typescript`) so they cannot drift.

### How do environment variables work in a Vite React app?

Vite exposes variables from `.env`, `.env.development`, `.env.production` (and the real environment) on `import.meta.env`, but only those prefixed with `VITE_`, for example `import.meta.env.VITE_API_URL`. They are **inlined into the JavaScript bundle at build time**, so anything in them is public. Never put secrets (API keys, client secrets) in front-end env variables; keep them on the server and call the server instead. Built-ins include `import.meta.env.MODE`, `DEV` and `PROD`.

### What is React Testing Library's philosophy, and which queries do you prefer? {core}

"The more your tests resemble the way your software is used, the more confidence they give you." So RTL renders real DOM and you find elements the way a user or a screen reader would. Query priority: `getByRole` (with `name`) first, then `getByLabelText` for form fields, `getByPlaceholderText`, `getByText`, `getByDisplayValue`, then `getByAltText`/`getByTitle`, and `getByTestId` only as a last resort.

Role-based queries also act as an accessibility check: if you cannot find a button by role and name, neither can a screen-reader user.

### getBy, queryBy and findBy: what is the difference? {core}

`getBy*` returns the element or **throws** if there is no match (or more than one), so use it for things that must be there. `queryBy*` returns **null** when there is no match, so use it to assert that something is absent (`expect(screen.queryByText('Error')).not.toBeInTheDocument()`). `findBy*` returns a **promise** that retries until the element appears (default timeout 1 s), so use it for UI that appears after async work. Each has an `*AllBy*` variant for multiple matches.

### How do you mock API calls in component tests?

Options from simplest to most realistic: stub `fetch` with `vi.stubGlobal('fetch', vi.fn(...))` returning `new Response(...)`; mock your API module with `vi.mock('./api')`; or use **MSW** (Mock Service Worker), which intercepts requests at the network level so the component's real fetch code runs and the same handlers work in tests, Storybook and local development. I prefer MSW for anything beyond a single call, because tests do not depend on how the data is fetched.

Test the important states: loading, success, empty, server error and validation error.

### What is the difference between user-event and fireEvent? {deep}

`fireEvent` dispatches one DOM event (`fireEvent.change(input, { target: { value: 'x' } })`). `user-event` simulates a real interaction sequence: `user.type` focuses the element and fires keydown, keypress, input and keyup for each character; `user.click` fires pointer and mouse events and moves focus. That catches bugs `fireEvent` misses (disabled buttons, focus handling, `maxLength`). In v14, create an instance with `userEvent.setup()` and `await` every call.

### What accessibility basics do you apply in React forms and components?

Use semantic elements first (`<button>` not a clickable `<div>`, `<label>` tied to each input, headings in order, `<table>` for tabular data). Make everything keyboard reachable and visible on focus. Associate errors with `aria-describedby` and set `aria-invalid`; announce async results with `role="alert"` or `aria-live`. Manage focus when content changes: move focus into an opened modal, trap it there, and return it on close. Provide `alt` text for meaningful images. Healthcare portals are often held to WCAG 2.1 AA (Section 508 for government programs).

### When do you use unknown instead of any, and how do you type API responses? {core}

`any` turns off type checking, so mistakes spread silently. `unknown` means "I do not know yet": you must narrow it (`typeof`, `instanceof`, a type guard) before using it. Catch clauses and parsed JSON are good places for `unknown`.

For API responses, a type assertion (`as Patient`) only tells the compiler what you hope is true. For data you do not control, validate at runtime with a schema library such as zod and infer the type from the schema, or generate types from FastAPI's OpenAPI document. That mirrors what Pydantic does on the Python side.

### Which TypeScript utility types do you use most in React code? {deep}

`Partial<T>` (all fields optional: form drafts, PATCH bodies), `Pick<T, K>` and `Omit<T, K>` (derive a component's props from a model), `Record<K, V>` (maps such as field → error message), `ReturnType<typeof fn>` and `Awaited<T>` (types from functions, for example a Redux `RootState`), `ComponentProps<typeof Comp>` (props of an existing component), `NonNullable<T>`, and `as const` for literal tuples. Template literal types are handy for things like route paths or event names.
