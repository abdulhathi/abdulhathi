import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../chapters';
import { snippetPaths } from '../lib/snippets';

describe('chapters', () => {
  // Rendering every body proves each referenced snippet file exists and every
  // diagram edge points at a real node; both throw otherwise.
  it.each(CHAPTERS.map((c) => [`${c.num} ${c.title}`, c] as const))('%s renders', (_, chapter) => {
    const { container } = render(<chapter.Body />);
    expect(container.textContent?.length).toBeGreaterThan(100);
  });

  it('has unique ids, which double as URLs', () => {
    const ids = CHAPTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('bundles the tested practice project', () => {
    expect(snippetPaths).toContain('docker-compose.yml');
    expect(snippetPaths).toContain('src/09-shopflow/order-api.ts');
  });
});
