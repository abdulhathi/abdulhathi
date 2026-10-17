import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { APPS } from '../apps';
import type { Page } from '../lib/api';
import { appHref } from '../lib/route';

type Hit = { appId: string; appName: string; page: Page };

export function searchPages(pages: Record<string, Page[]>, query: string, limit = 40): Hit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: Hit[] = [];
  for (const app of APPS) {
    for (const page of pages[app.id] ?? []) {
      const text = `${app.name} ${page.group ?? ''} ${page.title} ${page.id}`.toLowerCase();
      if (terms.every((t) => text.includes(t))) hits.push({ appId: app.id, appName: app.name, page });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

/** Search every page of every app. Press / to focus it from anywhere. */
export function Search({ pages }: { pages: Record<string, Page[]> }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hits = useMemo(() => searchPages(pages, query), [pages, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (hit: Hit) => {
    window.location.hash = appHref(hit.appId, hit.page.id);
    setQuery('');
    setOpen(false);
    input.current?.blur();
  };

  const expanded = open && query.trim() !== '';
  return (
    <div className="search">
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label="Search pages in every app"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && hits[active] ? `${listId}-${active}` : undefined}
        placeholder="Search pages in every app  ( / )"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && hits[active]) {
            e.preventDefault();
            go(hits[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {expanded && (
        <ul className="search-results" id={listId} role="listbox" aria-label="Matching pages">
          {hits.length === 0 && <li className="muted search-empty">No page matches “{query}”.</li>}
          {hits.map((hit, i) => (
            <li
              key={`${hit.appId}/${hit.page.id}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(hit)}
            >
              <span className="hit-title">{hit.page.title}</span>
              <span className="hit-where">
                {hit.appName}
                {hit.page.group ? ` · ${hit.page.group}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
