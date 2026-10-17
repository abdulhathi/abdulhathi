---
title: Accessibility and responsive UI
goal: Build React interfaces that meet WCAG 2.2 AA (semantic HTML, keyboard and focus, live regions for streaming text, contrast, accessible forms, tables and charts), test them, and choose responsive layouts and component libraries with clear reasons.
minutes: 45
---

Enterprise web apps are often required to meet **strict security and accessibility standards**. Large enterprises and public-sector customers usually require **WCAG 2.1 or 2.2 Level AA** in their contracts, and US federal work falls under **Section 508**. Interviewers check whether you know the standard, build accessibly by default (semantic HTML, keyboard, focus, labels), and can handle the hard parts of modern product UIs: a **chat that streams text** (announcing it without flooding a screen reader), **live dashboards** (status that is not shown by colour alone), dialogs for **human approvals**, and dense data tables.

**Your angle:** your resume lists React Testing Library, whose role-based queries double as a basic accessibility check, and role-based admin screens on the Labels Web app. It does not list dedicated accessibility work, so do not claim audits or certifications. Speak from practice: semantic markup, keyboard testing and the checks below, and say how you would bring automated checks into CI.

## WCAG in one page

WCAG (Web Content Accessibility Guidelines, from the W3C) is organised under four principles, **POUR**:

| Principle | Means | Examples |
|---|---|---|
| **Perceivable** | users can perceive the content | text alternatives, captions, contrast, not relying on colour, content that reflows |
| **Operable** | users can operate the UI | everything works by keyboard, visible focus, enough time, no seizure risks, big enough targets |
| **Understandable** | content and behaviour are predictable | labels and instructions, clear errors, consistent navigation |
| **Robust** | works with assistive technology | valid names, roles and states; status messages exposed programmatically |

Each success criterion has a level: **A** (minimum), **AA** (the usual legal and contractual target) and **AAA** (enhanced; not required for whole sites). Versions: WCAG 2.0 (2008), 2.1 (2018, adding mobile, low-vision and cognitive criteria such as reflow and non-text contrast), and **2.2 (October 2023)**. Each version is backwards compatible, so meeting 2.2 AA also meets 2.1 and 2.0 AA. WCAG 3 is still a working draft, not a standard.

### What WCAG 2.2 added

| Criterion | Level | In practice |
|---|---|---|
| 2.4.11 Focus Not Obscured (Minimum) | AA | a focused element must not be completely hidden by sticky headers, cookie banners or chat widgets |
| 2.4.12 Focus Not Obscured (Enhanced) | AAA | not even partly hidden |
| 2.4.13 Focus Appearance | AAA | focus indicator of a minimum size and contrast |
| 2.5.7 Dragging Movements | AA | anything done by dragging (reordering, sliders, Kanban) also works with single clicks or taps |
| 2.5.8 Target Size (Minimum) | AA | pointer targets at least **24 × 24 CSS px**, or with enough spacing around them |
| 3.2.6 Consistent Help | A | help links or contact options appear in the same place across pages |
| 3.3.7 Redundant Entry | A | do not make users re-type information they already gave in the same process |
| 3.3.8 Accessible Authentication (Minimum) | AA | no cognitive tests to log in: allow paste and password managers, offer alternatives to puzzles |
| 3.3.9 Accessible Authentication (Enhanced) | AAA | stricter version of the above |

WCAG 2.2 also removed **4.1.1 Parsing**, which modern browsers and assistive technology made obsolete.

### Criteria that matter most for chat and dashboard apps

- **1.3.1 Info and Relationships (A):** structure is in the markup (headings, lists, tables, labels), not just in the visuals.
- **1.4.3 Contrast (AA):** text at least **4.5:1**, large text (18 pt, or 14 pt bold, roughly 24 px or 18.7 px bold) at least **3:1**.
- **1.4.11 Non-text Contrast (AA):** UI component boundaries, focus indicators and meaningful graphics (chart lines, status icons) at least **3:1**.
- **1.4.1 Use of Color (A):** a run's status cannot be shown by colour alone; add text or an icon with a label.
- **1.4.10 Reflow (AA):** usable at **320 CSS px** wide (a 1280 px window at 400% zoom) without scrolling in two directions; data tables and code are allowed to scroll.
- **2.1.1 Keyboard (A)** and **2.4.7 Focus Visible (AA)**: every action works with a keyboard, and you can see where focus is.
- **4.1.2 Name, Role, Value (A):** custom controls expose a name, role and state to assistive technology.
- **4.1.3 Status Messages (AA):** messages like "Response complete" or "3 results" are announced without moving focus (live regions).

## Semantic HTML first, ARIA second

The **first rule of ARIA**: if a native element does the job, use it. A `<button>` gives you focus, Enter and Space activation, the button role and disabled semantics for free; a clickable `<div>` gives you none of that. ARIA only changes what assistive technology is told. It adds **no behaviour**, so a `role="button"` still needs `tabIndex`, key handlers and focus styles.

| Need | Use | Not |
|---|---|---|
| An action | `<button type="button">` | `<div onClick>`, `<a href="#">` |
| Navigation to a URL | `<a href>` | a button that sets `location` |
| Page regions | `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>` | anonymous divs |
| Headings | `<h1>`–`<h6>` in order, one `<h1>` per view | bold text |
| Form field name | `<label htmlFor>` (or wrapping `<label>`) | placeholder text alone |
| Tabular data | `<table>` with `<caption>`, `<th scope>` | a grid of divs |
| Show/hide | `<details>`/`<summary>`, or a button with `aria-expanded` | toggling a div with no state |
| Modal | `<dialog>` opened with `showModal()` | a div with a z-index |
| Meaningful image | `<img alt="what it shows or does">`; decorative images get `alt=""` | a missing `alt`, or a file name as alt text |

Every interactive element needs an **accessible name**. Browsers compute it in this order: `aria-labelledby`, then `aria-label`, then the native mechanism (`<label>`, `alt`, `<caption>`, `<legend>`), then the element's text content where the role allows it, and `title` or `placeholder` as a weak last resort. An icon-only button therefore needs `aria-label` (or visually hidden text), and its SVG gets `aria-hidden="true"`.

Common states to keep in sync with the UI: `aria-expanded` (disclosure, menu button), `aria-selected` (tabs, listbox options), `aria-pressed` (toggle button), `aria-current="page"` (navigation), `aria-invalid` and `aria-describedby` (form errors), `aria-busy` (a region being updated), `aria-sort` (table headers). Never put `aria-hidden="true"` on something that can receive focus.

## Keyboard and focus management

- **Tab order follows the DOM.** Never use a positive `tabIndex`; use `0` to make a custom control focusable and `-1` for elements you focus programmatically (a heading after navigation, an error summary).
- **Visible focus:** style `:focus-visible` with a strong outline; never remove outlines without a replacement. Make sure sticky headers and chat widgets do not cover the focused element (2.4.11).
- **Skip link:** a first link "Skip to main content" that jumps past the navigation.
- **Route changes in an SPA:** the browser does not reset focus when React swaps the page. Move focus to the new page's `<h1>` (with `tabIndex={-1}`) and update `document.title`, so screen-reader users know the page changed.
- **Dialogs:** move focus into the dialog, keep it there, close on Escape, and return focus to the control that opened it. The native `<dialog>` element with `showModal()` makes the rest of the page inert and handles Escape.
- **Composite widgets** (tabs, menus, listboxes, toolbars, grids): one Tab stop for the whole widget, and arrow keys move inside it. This is **roving tabindex**: the active item has `tabIndex={0}`, the others `-1`. The WAI-ARIA Authoring Practices Guide (APG) documents the expected keys for each pattern.

```tsx
import { useRef, useState, type KeyboardEvent } from 'react';

type Tab = { id: string; label: string; content: string };

// The APG tabs pattern: one tab stop, arrow keys move between tabs, Home/End jump, selection follows focus.
export function RunTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = (index: number) => {
    setActive(index);
    refs.current[index]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = tabs.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: active === last ? 0 : active + 1,
      ArrowLeft: active === 0 ? last : active - 1,
      Home: 0,
      End: last,
    };
    const next = moves[e.key];
    if (next === undefined) return;
    e.preventDefault();
    focusTab(next);
  };

  return (
    <div>
      <div role="tablist" aria-label="Run details">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={i === active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={onKeyDown}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, i) => (
        <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={i !== active} tabIndex={0}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
```

A human-approval dialog with the native element. Initial focus and the return of focus to the opener are both set explicitly, which is reliable across browsers and custom flows. Do not rely on React's `autoFocus` prop here: React implements it by calling `focus()` when the element **mounts**, and a dialog that is mounted closed and opened later never gets that call.

```tsx
import { useEffect, useRef } from 'react';

type Props = { open: boolean; action: string; onApprove: () => void; onReject: () => void; onClose: () => void };

export function ApprovalDialog({ open, action, onApprove, onReject, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const approveRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement as HTMLElement | null; // remember who opened it
      dialog.showModal(); // the page behind becomes inert
      approveRef.current?.focus(); // choose the initial focus explicitly
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="approval-title"
      aria-describedby="approval-desc"
      onClose={() => {
        onClose(); // fires on Escape and on close()
        openerRef.current?.focus();
      }}
    >
      <h2 id="approval-title">Approval needed</h2>
      <p id="approval-desc">The agent wants to: {action}</p>
      <button type="button" onClick={onReject}>
        Reject
      </button>
      <button ref={approveRef} type="button" onClick={onApprove}>
        Approve
      </button>
    </dialog>
  );
}
```

For a destructive or high-impact action (an agent creating a purchase order in an ERP), consider putting initial focus on the safer choice ("Reject"), or on the dialog's description, instead of on "Approve", so a stray Enter cannot approve it.

## Live regions for streaming text and status

A **live region** tells screen readers to announce changes to its content without moving focus (WCAG 4.1.3).

| Markup | Politeness | Use for |
|---|---|---|
| `role="log"` | polite (implicit) | a chat transcript or event log: new entries appended at the end |
| `role="status"` | polite, atomic | short status: "Response complete", "Saved", "3 runs failed" |
| `role="alert"` | assertive, atomic | urgent errors only; it interrupts the user |
| `aria-live="polite"` / `"assertive"` | as written | custom regions; add `aria-atomic="true"` to read the whole region on change |

Rules that make them work:

- The region must **exist in the DOM before** its content changes. A region rendered together with its first message is often not announced.
- **Do not announce every token.** A screen reader that tries to read each fragment of a streaming answer either stutters or queues hundreds of announcements. Mark the in-progress message `aria-busy="true"` and keep it out of the live region, then announce complete sentences or the whole answer when it finishes, plus a short status such as "Assistant is responding" and "Response complete".
- Use `assertive` sparingly: errors that block the user, not progress updates.
- Give users control: a "Stop generating" button, and a way to read the latest answer on demand (focus can be moved to it when the user asks).

```tsx
type Message = { id: string; role: 'user' | 'assistant'; text: string };

// Finished messages go into the log (announced politely as they are appended).
// The streaming answer is shown but busy, and a separate status region reports progress.
export function ChatTranscript({ messages, streamingText, streaming }: { messages: Message[]; streamingText: string; streaming: boolean }) {
  return (
    <section aria-labelledby="chat-heading">
      <h2 id="chat-heading">Conversation</h2>
      {/* The log role goes on a wrapper: putting it on the <ol> would remove the list semantics its <li>s need. */}
      <div role="log" aria-label="Messages">
        <ol>
          {messages.map((m) => (
            <li key={m.id}>
              <span className="visually-hidden">{m.role === 'user' ? 'You said:' : 'Assistant said:'}</span>
              <p>{m.text}</p>
            </li>
          ))}
        </ol>
      </div>
      {streaming && (
        // Not a live region, so tokens are not announced. aria-label is not allowed on a plain div, so the
        // prefix is visually hidden text instead.
        <div aria-busy="true">
          <span className="visually-hidden">Assistant, still responding:</span>
          <p>{streamingText}</p>
        </div>
      )}
      <p role="status" className="visually-hidden">
        {streaming ? 'Assistant is responding' : messages.length > 0 ? 'Response complete' : ''}
      </p>
    </section>
  );
}
```

The `visually-hidden` class (sometimes called `sr-only`) hides text visually but keeps it in the accessibility tree: `position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;`. Do not use `display: none` or `visibility: hidden` for that, because those hide it from screen readers too.

## Colour, contrast and motion

- Meet **4.5:1** for normal text and **3:1** for large text, icons, chart lines, input borders and focus rings. Check both light and dark themes.
- **Never colour alone:** a run status chip shows text ("Failed") and an icon with a text alternative, not just a red dot. Charts use patterns, direct labels or markers in addition to colour.
- **Reduced motion:** honour `prefers-reduced-motion` by removing non-essential animation (auto-scrolling effects, pulsing indicators, parallax).
- **Forced colours:** Windows high-contrast mode replaces your colours; use real borders and outlines (not only background colours or box shadows) so controls stay visible, and test with `@media (forced-colors: active)`.

```tsx
import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

// Reads the user's OS setting and re-renders if it changes. The server snapshot assumes reduced motion.
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);
}

export function LiveIndicator({ active }: { active: boolean }) {
  const reduced = usePrefersReducedMotion();
  return (
    <span className={active && !reduced ? 'dot pulsing' : 'dot'}>
      <span className="visually-hidden">{active ? 'Live updates on' : 'Live updates paused'}</span>
    </span>
  );
}
```

## Accessible forms and errors

- Every field has a visible `<label>`; placeholders are hints, not labels.
- Group related fields with `<fieldset>` and `<legend>` (a set of radio buttons, an address).
- Use the right `type` and **`autocomplete`** tokens (`email`, `username`, `current-password`, `one-time-code`) so browsers and password managers can fill them (1.3.5, and 3.3.8 for login).
- Mark required fields in text, not just with a red asterisk, and with the `required` attribute.
- On submit with errors: show an **error summary** at the top that lists each error as a link to its field, **move focus** to the summary, mark each field `aria-invalid="true"` and connect its message with `aria-describedby`.
- Do not disable the submit button until the form is valid: users cannot discover why it is disabled. Validate on submit and explain.

```tsx
import { useRef, useState, type FormEvent } from 'react';

type Field = 'name' | 'endpoint';
type Errors = Partial<Record<Field, string>>;

function validate(values: Record<Field, string>): Errors {
  const errors: Errors = {};
  if (!values.name.trim()) errors.name = 'Enter a name for the connector';
  if (!/^https:\/\/\S+$/.test(values.endpoint)) errors.endpoint = 'Enter an https:// URL';
  return errors;
}

export function ConnectorForm({ onSave }: { onSave: (values: Record<Field, string>) => void }) {
  const [values, setValues] = useState<Record<Field, string>>({ name: '', endpoint: '' });
  const [errors, setErrors] = useState<Errors>({});
  const summaryRef = useRef<HTMLDivElement>(null);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus()); // after the summary renders
      return;
    }
    onSave(values);
  };

  const field = (name: Field, label: string, hint: string) => (
    <div>
      <label htmlFor={name}>{label}</label>
      <p id={`${name}-hint`}>{hint}</p>
      <input
        id={name}
        name={name}
        required
        value={values[name]}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `${name}-hint ${name}-error` : `${name}-hint`}
      />
      {errors[name] && <p id={`${name}-error`}>Error: {errors[name]}</p>}
    </div>
  );

  const list = Object.entries(errors) as [Field, string][];
  return (
    <form onSubmit={submit} noValidate>
      {list.length > 0 && (
        <div ref={summaryRef} tabIndex={-1} role="group" aria-labelledby="error-summary-title">
          <h2 id="error-summary-title">There is a problem</h2>
          <ul>
            {list.map(([name, message]) => (
              <li key={name}>
                <a href={`#${name}`}>{message}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {field('name', 'Connector name (required)', 'Shown to operators in the run log.')}
      {field('endpoint', 'Endpoint URL (required)', 'The enterprise API the agent may call.')}
      <button type="submit">Save connector</button>
    </form>
  );
}
```

## Data tables and charts

- Use a real `<table>` with a `<caption>`, `<th scope="col">` for column headers and `<th scope="row">` for row headers. Screen readers then announce the header with each cell.
- A sortable column puts a **button** inside the header and sets **`aria-sort`** (`ascending`, `descending`) on the sorted `<th>`.
- Use `role="grid"` only if cells are interactive and you implement grid keyboard navigation; a normal table is better for read-only data.
- Charts need a **text alternative**: a short summary of the takeaway ("Error rate rose from 0.5% to 4% after 14:00"), plus the underlying numbers in a table (visible or behind a "Show data" toggle). Do not rely on colour to distinguish series.

```tsx
import { useState } from 'react';

type Run = { id: string; agent: string; status: 'running' | 'succeeded' | 'failed'; durationMs: number };
type SortKey = 'agent' | 'durationMs';

export function RunsTable({ runs }: { runs: Run[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'ascending' | 'descending' }>({ key: 'durationMs', dir: 'descending' });
  const sorted = [...runs].sort((a, b) => {
    const order = a[sort.key] < b[sort.key] ? -1 : a[sort.key] > b[sort.key] ? 1 : 0;
    return sort.dir === 'ascending' ? order : -order;
  });

  const header = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? sort.dir : undefined}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'ascending' ? 'descending' : 'ascending' }))}
      >
        {label}
      </button>
    </th>
  );

  return (
    <table>
      <caption>Recent agent runs, sorted by {sort.key === 'agent' ? 'agent' : 'duration'}</caption>
      <thead>
        <tr>
          <th scope="col">Run</th>
          {header('agent', 'Agent')}
          <th scope="col">Status</th>
          {header('durationMs', 'Duration')}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id}>
            <th scope="row">{r.id}</th>
            <td>{r.agent}</td>
            {/* Text, not just a coloured dot. */}
            <td>
              <span className={`status ${r.status}`}>{r.status}</span>
            </td>
            <td>{(r.durationMs / 1000).toFixed(1)} s</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

## Testing accessibility

| Layer | Tool | Catches |
|---|---|---|
| Editor and lint | `eslint-plugin-jsx-a11y` | missing `alt`, click handlers on non-interactive elements, invalid ARIA attributes |
| Component tests | React Testing Library queries **by role and name**; `jest-axe` / `vitest-axe` | elements without accessible names, wrong roles, rule violations in rendered components |
| E2E | Playwright `getByRole`, `toMatchAriaSnapshot`, `@axe-core/playwright` | whole-page rule violations, keyboard flows, focus after navigation |
| Audits | Lighthouse, axe DevTools, the browser's accessibility tree inspector | quick checks during development |
| Manual | keyboard-only pass, zoom to 200% and 400%, a screen reader (VoiceOver on macOS and iOS, NVDA on Windows, TalkBack on Android) | everything automation cannot judge |

Automated rules find only part of the problems (commonly quoted at around a third to a half). They cannot tell whether alt text is meaningful, whether the focus order makes sense, or whether a streaming answer is announced sensibly. Combine them with a short manual checklist per feature.

```ts typecheck
import { expect, test } from '@playwright/test';

test('approval dialog is reachable and labelled by keyboard', async ({ page }) => {
  await page.goto('/runs/run_42');

  // Role-based locators fail if the accessible name is missing, which is itself an accessibility check.
  await page.getByRole('button', { name: 'Review pending action' }).focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Approval needed' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Approve' })).toBeFocused();

  // An ARIA snapshot asserts the structure screen readers see, not the pixels.
  await expect(dialog).toMatchAriaSnapshot(`
    - dialog "Approval needed":
      - heading "Approval needed" [level=2]
      - button "Reject"
      - button "Approve"
  `);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Review pending action' })).toBeFocused(); // focus returned
});
```

A whole-page axe scan in Playwright needs the `@axe-core/playwright` package, which this lab does not install:

```ts norun
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('run dashboard has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/runs');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
});
```

## Responsive design

- **Mobile first:** base styles for small screens, then `min-width` media queries that add layout as space allows. Choose breakpoints where the content breaks, not by device names.
- **Fluid layouts:** CSS Grid and Flexbox with `minmax()`, `auto-fit`, `gap`; fluid type and spacing with `clamp()`; relative units (`rem`) so text zoom works.
- **Container queries** (`container-type: inline-size` and `@container`) let a component adapt to the space it is given, not the viewport. A run card in a narrow side panel and the same card in a wide grid can lay out differently.
- **Reflow and zoom:** content must work at 320 CSS px and with 200% text size; avoid fixed heights that clip text; let data tables and code blocks scroll horizontally inside their own container.
- **Touch:** targets at least 24 × 24 px (2.5.8, AA), and 44 × 44 px where you can (the AAA level, 2.5.5); no hover-only actions.

```css
/* A run card that adapts to its container, not the viewport. */
.run-list { container-type: inline-size; }

.run-card { display: grid; gap: 0.5rem; padding: clamp(0.75rem, 2cqi, 1.25rem); }

@container (min-width: 36rem) {
  .run-card { grid-template-columns: 1fr auto auto; align-items: center; }
}

.run-card button { min-height: 44px; min-width: 44px; }

:focus-visible { outline: 3px solid var(--focus, #1D4ED8); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}

@media (forced-colors: active) {
  .status { border: 1px solid CanvasText; }
}
```

## Component libraries and design systems

| Library | Style | Accessibility | Good fit |
|---|---|---|---|
| **MUI** (Material UI) | styled, Material Design | good defaults, mature | enterprise apps that accept Material's look or theme it heavily |
| **Radix Primitives** | headless (you style) | strong: follows APG patterns, focus management built in | custom design systems |
| **shadcn/ui** | copy-in components built on Radix-style primitives and Tailwind | inherits the primitives' accessibility | teams that want to own and edit the component code |
| **React Aria** (Adobe) | headless hooks and components | very strong, tested across screen readers, internationalised | demanding accessibility requirements |
| **Headless UI** (Tailwind Labs) | headless | good, smaller set of components | Tailwind projects |
| Chakra UI, Mantine, Ant Design | styled | varies by component | fast delivery with a ready-made look |

How to choose: accessibility of the complex widgets (combobox, menu, dialog, date picker, data grid), theming and **design tokens** (colours, spacing, typography as named variables, usually CSS custom properties, which also make dark mode and per-tenant branding easy), bundle size, server rendering support, and what the organisation already uses. Wrap third-party components behind your own thin API so you can change library without touching every screen. A library is not a compliance guarantee: misuse (an icon button with no label, a dialog with no title) still fails.

## Standards and contracts in the US enterprise

- **Section 508** of the Rehabilitation Act applies to US federal agencies and the technology they buy. The 2017 refresh adopts **WCAG 2.0 Level AA** by reference.
- Vendors document conformance in an **Accessibility Conformance Report (ACR)**, usually written on the **VPAT** template. Enterprise and public-sector buyers ask for one.
- The ADA has no technical standard for private websites, but lawsuits and settlements generally point to WCAG 2.1 AA, and the Department of Justice's 2024 rule for state and local governments adopts WCAG 2.1 AA.
- In US healthcare, HHS's 2024 **Section 504** rule requires organisations that receive HHS funding (most hospitals and many providers) to make websites and apps conform to **WCAG 2.1 AA**; its phased deadlines were pushed back in 2026, so check the current dates before quoting one. Section 508 applies when federal agencies are involved. The same practices apply in health tech.
- Outside the US, the **European Accessibility Act** has applied since 28 June 2025. The technical standard used in practice is **EN 301 549**, whose web requirements are WCAG 2.1 AA.

## Interview questions

### How do you make sure a React app meets accessibility standards? {core}

I build it in rather than audit it at the end. Semantic HTML first (real buttons, links, labels, headings, tables), every interactive element reachable and operable by keyboard with visible focus, accessible names on everything, focus managed on route changes and in dialogs, and live regions for status messages. In the pipeline: `eslint-plugin-jsx-a11y`, React Testing Library tests that query by role and name, and axe checks in component and Playwright tests so regressions fail CI. Before release, a short manual pass: keyboard only, 200% zoom and 320 px width, and a screen-reader smoke test.

The target is usually WCAG 2.1 or 2.2 Level AA. I would confirm which one the customer's contract names, and whether they need an ACR.

### What is WCAG, and what do the levels mean? {core}

The W3C's Web Content Accessibility Guidelines: testable success criteria under four principles, Perceivable, Operable, Understandable and Robust. Each criterion is Level A (the minimum), AA or AAA. **AA** is what laws, procurement rules and contracts usually require; AAA is aspirational and not expected for whole products. The current version is **2.2** (October 2023), which is backwards compatible with 2.1 and 2.0, so meeting 2.2 AA satisfies the older AA targets too.

### What changed in WCAG 2.2? {deep}

Nine new criteria, six of them at A or AA: **Focus Not Obscured** (a focused element must not be fully hidden by sticky headers or overlays), **Dragging Movements** (drag interactions need a single-pointer alternative), **Target Size Minimum** (24 × 24 CSS px or enough spacing), **Consistent Help**, **Redundant Entry** (do not ask for the same information twice in a process) and **Accessible Authentication** (no cognitive tests to log in; allow paste and password managers). Focus Appearance and the enhanced versions are AAA. It also removed 4.1.1 Parsing as obsolete.

In a chat or dashboard app, Focus Not Obscured matters with sticky chat inputs and toolbars, and Dragging Movements with any drag-to-reorder pipeline builder.

### Why "semantic HTML first", and when do you need ARIA? {core}

Native elements come with behaviour and semantics that assistive technology already understands: a `<button>` is focusable, activates with Enter and Space, and announces itself as a button. ARIA only changes what is announced and adds no behaviour, so recreating a button with `role="button"` means re-implementing focus, keys and states yourself, usually incompletely. I use ARIA for patterns HTML lacks (tabs, comboboxes, live regions, `aria-expanded` on a disclosure button) and follow the APG patterns for the keyboard model. "No ARIA is better than bad ARIA": a wrong role or a stale state misleads users more than no attribute.

### How do you make a streaming chat accessible? {core}

The transcript is a `role="log"` region, so completed messages are announced politely as they are added. The answer that is still streaming is visible but marked `aria-busy` and kept out of the live region, because announcing every token floods the screen reader. A separate `role="status"` region says "Assistant is responding" and "Response complete". On completion, the finished message is announced (or sentence by sentence for long answers, at a calm rate). Focus stays in the input, a Stop button is keyboard accessible, and each message has a visually hidden "You said / Assistant said" prefix. Errors that block the user use `role="alert"`.

I would test it with VoiceOver and NVDA, because screen readers handle live regions differently.

### What are live regions, and what is the difference between polite and assertive?

Live regions are containers whose changes screen readers announce without moving focus, which is how WCAG's status-message criterion is met. `aria-live="polite"` waits until the user is idle; `assertive` interrupts immediately and should be reserved for urgent errors. The roles carry defaults: `status` and `log` are polite, `alert` is assertive, and `status` and `alert` are atomic (the whole region is read). The region must already be in the DOM before its content changes, and you should announce short, meaningful messages, not every update.

### How do you manage focus in a single-page app? {core}

On route changes, move focus to the new page's main heading (with `tabIndex={-1}`) and update `document.title`, because the browser does not do it when React swaps content. In dialogs, move focus in, keep it inside (the native `<dialog>` with `showModal()` makes the background inert), close on Escape, and return focus to the opener. After deleting an item, focus the next item or the list heading, not `<body>`. After a failed form submit, focus the error summary. And never remove focus outlines without a visible replacement.

### What is roving tabindex? {deep}

The keyboard model for composite widgets like tabs, toolbars, menus and listboxes: the whole widget is one Tab stop, and arrow keys move between its items. The active item has `tabIndex={0}` and all others `-1`; on an arrow key you update which item is active and call `.focus()` on it. Home and End jump to the ends. The alternative is `aria-activedescendant`, where focus stays on the container and an attribute points to the active item, which suits comboboxes where focus must stay in a text input.

### How do you show the status of agent runs on a dashboard accessibly? {core}

Never by colour alone: each status has text ("Failed") and an icon with a text alternative, and colours meet 3:1 against their background. Status changes that matter are announced through a polite `role="status"` region, summarised rather than per event ("2 runs failed in the last minute"), so a busy dashboard does not talk constantly. Tables use real table markup with captions and header scopes; charts have a text summary and a data-table alternative. Animations such as pulsing "live" dots respect `prefers-reduced-motion`.

### What contrast ratios does WCAG require?

Level AA: **4.5:1** for normal text and **3:1** for large text (18 pt, or 14 pt bold). Since WCAG 2.1, non-text elements that convey information or show a control's boundary (input borders, focus indicators, icons, chart lines) also need **3:1** against adjacent colours. AAA raises text to 7:1 and 4.5:1. The ratio comes from relative luminance: `(L1 + 0.05) / (L2 + 0.05)`. Check both themes, and text on images or gradients at its worst point.

### How do you make forms accessible? {core}

Visible labels tied to inputs, hints and errors connected with `aria-describedby`, `aria-invalid` on fields in error, required fields marked in text, related fields grouped with `fieldset` and `legend`, and correct `type` and `autocomplete` so browsers and password managers can help. On submit with errors, show an error summary with links to each field and move focus to it. Validate on submit or blur rather than on every keystroke, and do not silently disable the submit button. For login, WCAG 2.2 requires that users are not forced through cognitive tests, so allow paste and password managers.

### How do you make a data table and a chart accessible? {deep}

A real `<table>` with a `<caption>`, `<th scope="col">` and `<th scope="row">`, so each cell is announced with its headers. Sortable columns use a button in the header and `aria-sort` on the sorted `<th>`. Use `role="grid"` only when cells are interactive and you implement arrow-key navigation. A chart needs a text alternative that states the takeaway, the data available as a table, series that differ by more than colour (labels, markers, patterns), and keyboard access if points are interactive.

### How do you test accessibility, and what can automated tools not catch? {core}

In layers: `eslint-plugin-jsx-a11y` in the editor; React Testing Library queries by role and name, which fail when names or roles are missing; axe (jest-axe or vitest-axe) in component tests; Playwright with role locators, keyboard flows, ARIA snapshots and `@axe-core/playwright` in E2E. Automated rules catch only a portion of issues: they cannot judge whether alt text is meaningful, whether the focus order is logical, or whether announcements make sense. So each feature also gets a keyboard-only pass, a zoom and reflow check, and a screen-reader smoke test with VoiceOver or NVDA.

### What does Section 508 require, and what is a VPAT? {deep}

Section 508 requires US federal agencies to make the technology they develop, buy or use accessible. The refreshed standards (2017) adopt WCAG 2.0 Level AA by reference for web content, so vendors selling to agencies must meet it. A **VPAT** (Voluntary Product Accessibility Template) is the standard template a vendor fills in to produce an **Accessibility Conformance Report**, stating criterion by criterion whether the product supports, partially supports or does not support each requirement. Enterprises increasingly ask for one against WCAG 2.1 or 2.2 AA too.

### How do you approach responsive design for a data-heavy enterprise app?

Mobile first with fluid Grid and Flexbox layouts, `clamp()` for type and spacing, and `rem` units so text zoom works. I use **container queries** for components that live in panels of different widths (a run card in a sidebar versus a full-width grid). Dense content gets responsive strategies rather than shrinking: tables scroll horizontally in their own container or collapse secondary columns, dashboards reflow into a single column, side panels become drawers. It must reflow at 320 CSS px and 200% text without breaking, and touch targets must be at least 24 px, ideally 44 px.

### How do you choose a component library?

By how well its complex widgets work for keyboard and screen-reader users (combobox, menu, dialog, date picker, data grid), by theming and design-token support (dark mode, per-tenant branding), bundle size, server rendering support, maintenance and licence, and what the organisation already uses. For a custom design system, a headless library such as Radix, React Aria or Headless UI gives correct behaviour while you own the styling; shadcn/ui gives you the component code to edit. MUI suits teams that accept Material Design. Whatever the choice, I wrap it in our own components so it can be swapped, and remember that a good library can still be misused.

### What is the difference between hiding content visually and hiding it from assistive technology? {deep}

`display: none`, `visibility: hidden` and the `hidden` attribute hide content from everyone, including screen readers. A **visually hidden** class (1 px clipped box, `clip-path: inset(50%)`) hides it from sighted users but keeps it in the accessibility tree, for things like "Assistant said:" prefixes or icon labels. `aria-hidden="true"` does the opposite: visible on screen but removed from the accessibility tree, for decorative icons. Never put `aria-hidden` on a focusable element, because keyboard users would land on something screen readers cannot see. `inert` removes an entire region from both focus and the accessibility tree, for content behind a modal.

### What is an accessible name, and how is it computed? {deep}

The text assistive technology uses to identify an element ("Approve, button"). Browsers compute it in priority order: `aria-labelledby` (pointing to other elements' text), then `aria-label`, then the native mechanism (a `<label>` for inputs, `alt` for images, `<caption>` for tables, `<legend>` for fieldsets), then the element's own text content for roles that allow it (buttons, links), and finally `title` or `placeholder` as weak fallbacks. Icon-only buttons therefore need an `aria-label` or visually hidden text, and Playwright's `getByRole('button', { name })` uses the same computation, so tests catch missing names.

## Coding problems

### Compute the WCAG contrast ratio {easy core}

Write `contrastRatio(foreground, background)` for two hex colours such as `#767676` and `#ffffff`, and `meetsAA(fg, bg, largeText)`, which applies the 4.5:1 and 3:1 thresholds.

```text
contrastRatio('#767676', '#ffffff') → about 4.54  (passes AA for normal text)
contrastRatio('#777777', '#ffffff') → about 4.48  (fails AA for normal text)
contrastRatio('#000000', '#ffffff') → 21
```

#### Hints

1. Convert each channel to 0–1, then linearise it: small values divide by 12.92, larger ones use `((c + 0.055) / 1.055) ** 2.4`.
2. Relative luminance is `0.2126 R + 0.7152 G + 0.0722 B` on the linearised channels.
3. The ratio is `(lighter + 0.05) / (darker + 0.05)`; it does not depend on argument order.

#### Solution

Parse the hex colour, linearise each sRGB channel, weight the channels into relative luminance, then divide the lighter value by the darker one (each plus 0.05).

```ts
import assert from 'node:assert/strict';

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`Expected #rrggbb, got ${hex}`);
  const value = parseInt(m[1], 16);
  const [r, g, b] = [value >> 16, (value >> 8) & 0xff, value & 0xff].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function meetsAA(fg: string, bg: string, largeText = false): boolean {
  return contrastRatio(fg, bg) >= (largeText ? 3 : 4.5);
}

assert.equal(contrastRatio('#000000', '#ffffff'), 21);
assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
assert.equal(Math.round(contrastRatio('#767676', '#ffffff') * 100) / 100, 4.54);
assert.ok(meetsAA('#767676', '#FFFFFF'));
assert.ok(!meetsAA('#777777', '#ffffff'));
assert.ok(meetsAA('#777777', '#ffffff', true)); // fine for large text
assert.equal(contrastRatio('#1d4ed8', '#ffffff'), contrastRatio('#ffffff', '#1d4ed8')); // order does not matter
assert.throws(() => contrastRatio('blue', '#fff'));
```

Complexity: O(1).

#### Follow-ups

- **Semi-transparent colours?** Blend the foreground onto the background first (alpha compositing), then compute the ratio.
- **How would you use this in a design system?** As a unit test over every token pair you allow (text on surface, text on accent) in both themes, so a palette change that breaks contrast fails CI.

### Implement roving focus for a toolbar {easy}

Write `nextIndex(key, current, count, orientation)` that returns the index of the item that should receive focus in a toolbar or tab list, following the APG keyboard model: arrows move and wrap, Home and End jump, and keys for the other orientation do nothing. Return `current` for keys you do not handle.

```text
nextIndex('ArrowRight', 2, 3, 'horizontal') → 0   (wraps)
nextIndex('ArrowDown', 0, 3, 'horizontal')  → 0   (wrong axis)
nextIndex('End', 0, 5, 'vertical')          → 4
```

#### Hints

1. Pick the "previous" and "next" keys from the orientation first.
2. Wrapping is modular arithmetic; add `count` before taking the remainder so going left from 0 works.
3. Decide what happens with zero items.

#### Solution

Choose the key pair for the orientation, then apply modular arithmetic for wrapping. Home and End work on both axes.

```ts
import assert from 'node:assert/strict';

type Orientation = 'horizontal' | 'vertical';

export function nextIndex(key: string, current: number, count: number, orientation: Orientation): number {
  if (count <= 0) return -1;
  const [prev, next] = orientation === 'horizontal' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
  switch (key) {
    case next:
      return (current + 1) % count;
    case prev:
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return current;
  }
}

assert.equal(nextIndex('ArrowRight', 0, 3, 'horizontal'), 1);
assert.equal(nextIndex('ArrowRight', 2, 3, 'horizontal'), 0);
assert.equal(nextIndex('ArrowLeft', 0, 3, 'horizontal'), 2);
assert.equal(nextIndex('ArrowDown', 0, 3, 'horizontal'), 0);
assert.equal(nextIndex('ArrowDown', 1, 3, 'vertical'), 2);
assert.equal(nextIndex('Home', 2, 3, 'vertical'), 0);
assert.equal(nextIndex('End', 0, 5, 'vertical'), 4);
assert.equal(nextIndex('a', 1, 3, 'horizontal'), 1);
assert.equal(nextIndex('ArrowRight', 0, 0, 'horizontal'), -1);
```

Complexity: O(1).

#### Follow-ups

- **Disabled items?** Loop in the chosen direction until you find an enabled item, stopping after `count` steps.
- **Type-ahead?** Keep a short-lived buffer of typed characters and jump to the first item whose label starts with it, as listboxes and menus do.

### Announce a streaming answer without flooding screen readers {medium}

Tokens of an assistant's answer arrive one by one. Write `createAnnouncer(announce)` returning `{ push(token), finish() }`: it buffers tokens and calls `announce` only with **complete sentences** (ending in `.`, `!` or `?` followed by a space or the end), and `finish()` announces whatever remains. Never announce an empty string.

```text
push('Found 3 '), push('failed runs. Retrying '), push('now'), finish()
announce('Found 3 failed runs.') then announce('Retrying now')
```

#### Hints

1. Keep a string buffer; after each push, look for the last sentence boundary in it.
2. A regex such as `/[.!?](\s|$)/g` finds boundaries; but a boundary at the very end may be followed by more text later ("3.5"), so only treat end-of-buffer as a boundary in `finish()`.
3. Trim what you announce, and keep the remainder in the buffer.

#### Solution

Buffer tokens, and after each push find the last sentence end that is followed by whitespace. Announce everything up to it as one message and keep the rest. `finish()` flushes the remainder. Announcing several sentences in one call keeps the number of announcements low.

```ts
import assert from 'node:assert/strict';

export function createAnnouncer(announce: (text: string) => void) {
  let buffer = '';

  const emit = (text: string) => {
    const trimmed = text.trim();
    if (trimmed) announce(trimmed);
  };

  return {
    push(token: string) {
      buffer += token;
      // Sentence ends followed by whitespace; an end at the buffer's edge might still be "3." of "3.5".
      let cut = -1;
      for (const m of buffer.matchAll(/[.!?]\s/g)) cut = (m.index ?? 0) + 1;
      if (cut > 0) {
        emit(buffer.slice(0, cut));
        buffer = buffer.slice(cut);
      }
    },
    finish() {
      emit(buffer);
      buffer = '';
    },
  };
}

const said: string[] = [];
const a = createAnnouncer((t) => said.push(t));
for (const t of ['Found 3 ', 'failed runs. Retrying ', 'now']) a.push(t);
a.finish();
assert.deepEqual(said, ['Found 3 failed runs.', 'Retrying now']);

const said2: string[] = [];
const b = createAnnouncer((t) => said2.push(t));
for (const t of ['Latency is 3', '.5 s. ', 'All good! Done?', ' ']) b.push(t);
b.finish();
assert.deepEqual(said2, ['Latency is 3.5 s.', 'All good!', 'Done?']); // each push flushes the sentences it completed

const said3: string[] = [];
const c = createAnnouncer((t) => said3.push(t));
c.push('   ');
c.finish();
assert.deepEqual(said3, []);
```

Complexity: O(n) per push in the buffer length, which stays short because it is cut at every sentence end.

#### Follow-ups

- **Rate limiting?** Also hold announcements for a minimum interval (say 1–2 s) and join sentences that arrive in between, so fast answers are read calmly.
- **How does this connect to React?** The component writes the announced text into a `role="status"` or `aria-live="polite"` region that is always rendered, while the visible streaming text stays `aria-busy`.
- **Code blocks?** Do not read code token by token; announce "Code block, 12 lines" and let the user navigate into it.
