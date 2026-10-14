import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../chapters';
import { snippetPaths } from '../lib/snippets';

describe('chapters', () => {
  // Rendering every body proves each referenced snippet file exists and every
  // diagram edge points at a real node; both throw otherwise.
  it.each(CHAPTERS.map((c) => [`${c.num} ${c.title}`, c] as const))('%s renders', (_, chapter) => {
    const { container } = render(<chapter.Body />);
    expect(container.querySelector('[data-pending]'), 'chapter is still a placeholder').toBeNull();
    expect(container.textContent?.length).toBeGreaterThan(100);
  });

  it('has unique ids, which double as URLs', () => {
    const ids = CHAPTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('bundles the tested practice projects but not their installed packages', () => {
    expect(snippetPaths).toContain('01-hello-node/src/index.ts');
    expect(snippetPaths).toContain('01-hello-node/.gitignore');
    expect(snippetPaths).toContain('01-hello-node/.node-version');
    expect(snippetPaths.some((p) => p.includes('node_modules'))).toBe(false);
    expect(snippetPaths.some((p) => p.endsWith('package-lock.json'))).toBe(false);
  });
});
