import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../chapters';
import { renderWithProviders } from './render';

// Set ONLY to a comma-separated list of chapter ids to test just those while writing them,
// e.g. ONLY=two-pointers,sliding-window npx vitest run src/test/chapters.test.tsx
const only = process.env.ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
const chapters = only ? CHAPTERS.filter((c) => only.includes(c.id)) : CHAPTERS;

describe('chapters', () => {
  // Rendering every body proves each walkthrough has frames, every <See> link and diagram
  // reference is valid, and every problem resolves in the LeetCode snapshot; all of them throw otherwise.
  it.each(chapters.map((c) => [`${c.num} ${c.id}`, c] as const))('%s renders without placeholders', async (_, chapter) => {
    const { default: Body } = await chapter.load();
    const { container } = renderWithProviders(<Body />);
    expect(container.querySelector('[data-pending]'), 'chapter is still a placeholder').toBeNull();
    expect(container.textContent?.length).toBeGreaterThan(1500);
  });

  it('has unique ids, which double as URLs and file names', () => {
    const ids = CHAPTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
