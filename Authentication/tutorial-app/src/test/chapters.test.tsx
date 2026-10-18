import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../chapters';
import { snippetPaths } from '../lib/snippets';
import { StackProvider } from '../lib/stack';

describe('chapters', () => {
  // Rendering every body proves each referenced snippet file exists and every diagram edge points at a real node;
  // both throw otherwise.
  it.each(CHAPTERS.map((c) => [`${c.num} ${c.title}`, c] as const))('%s renders', (_, chapter) => {
    const { container } = render(
      <StackProvider>
        <chapter.Body />
      </StackProvider>,
    );
    expect(container.querySelector('[data-pending]'), 'chapter is still a placeholder').toBeNull();
    expect(container.textContent?.length).toBeGreaterThan(100);
  });

  it('has unique ids, which double as URLs, and topics that match their numbers', () => {
    const ids = CHAPTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CHAPTERS) if (c.topic) expect(c.topic.startsWith(`${c.num}-`), c.id).toBe(true);
  });

  it('bundles the tested snippet projects but nothing installed or generated', () => {
    expect(snippetPaths.some((p) => /(^|\/)(node_modules|\.venv|bin|obj|__pycache__)\//.test(p))).toBe(false);
    expect(snippetPaths.some((p) => p.endsWith('package-lock.json') || p.endsWith('.key.pem'))).toBe(false);
  });
});
