import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { STACK_LABEL, STACKS, type Stack } from '../lib/snippets';
import { useStack } from '../lib/stack';
import { CodeFile, Terminal } from './Code';

type PerStack<T> = Partial<Record<Stack, T>>;

/**
 * The same idea in Node.js, Python and .NET, as tabs. Choosing a tab switches every tab group in the lab, so a
 * Python reader sees Python everywhere. A group that lacks the chosen stack shows its first stack instead.
 */
export function ByStack({ label, ...content }: PerStack<ReactNode> & { label?: string }) {
  const { stack, setStack } = useStack();
  const available = STACKS.filter((s) => content[s] !== undefined);
  const shown = available.includes(stack) ? stack : available[0];
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + available.length) % available.length;
    setStack(available[next]);
    tabs.current[next]?.focus();
  };

  if (!shown) return null;
  return (
    <section className="stacks" aria-label={label ?? 'Code in each stack'}>
      <div className="stack-tabs" role="tablist" aria-label={label ?? 'Choose a stack'}>
        {available.map((s, i) => (
          <button
            key={s}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-${s}`}
            aria-selected={s === shown}
            aria-controls={`${id}-panel`}
            tabIndex={s === shown ? 0 : -1}
            className={s === shown ? `stack-tab is-on s-${s}` : `stack-tab s-${s}`}
            onClick={() => setStack(s)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {STACK_LABEL[s]}
          </button>
        ))}
        {available.length > 1 && <span className="stack-hint">Your choice applies to every example</span>}
      </div>
      <div className="stack-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${shown}`}>
        {content[shown]}
      </div>
    </section>
  );
}

const asList = (v: string | string[] | undefined) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

/** Tested project files for each stack, as tabs: <StackFiles node="04-jwt/node/src/app.ts" python={[…]} />. */
export function StackFiles({ label, node, python, dotnet }: { label?: string; node?: string | string[]; python?: string | string[]; dotnet?: string | string[] }) {
  const render = (paths: string[] | undefined) => paths && <>{paths.map((p) => <CodeFile key={p} path={p} />)}</>;
  return <ByStack label={label} node={render(asList(node))} python={render(asList(python))} dotnet={render(asList(dotnet))} />;
}

/** Terminal commands for each stack, as tabs. */
export function StackTerminal({ title, node, python, dotnet }: { title?: string; node?: string; python?: string; dotnet?: string }) {
  const render = (cmd: string | undefined) => cmd !== undefined && <Terminal title={title}>{cmd}</Terminal>;
  return <ByStack label={title ?? 'Commands for each stack'} node={render(node) || undefined} python={render(python) || undefined} dotnet={render(dotnet) || undefined} />;
}
