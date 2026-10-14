import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../chapters';
import { ALL_TAGS, lookup, NON_DSA_TAGS } from '../lib/leetcode';
import { TOPICS } from '../topics';

const only = process.env.ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
const topicChapters = CHAPTERS.filter((c) => c.kind === 'topic' && (!only || only.includes(c.id)));

describe('LeetCode coverage', () => {
  it('teaches every algorithm tag LeetCode uses', () => {
    const taught = new Set(CHAPTERS.flatMap((c) => c.tags));
    const missing = ALL_TAGS.filter((t) => !taught.has(t) && !(NON_DSA_TAGS as readonly string[]).includes(t));
    expect(missing).toEqual([]);
  });

  it('only names tags that exist on LeetCode', () => {
    const unknown = CHAPTERS.flatMap((c) => c.tags.filter((t) => !ALL_TAGS.includes(t)).map((t) => `${c.id}: ${t}`));
    expect(unknown).toEqual([]);
  });
});

describe.each(topicChapters.map((c) => [c.id] as const))('topic %s', (id) => {
  const topic = TOPICS[id];

  it('has a data file whose id matches the chapter', () => {
    expect(topic, `src/topics/${id}.ts is missing or does not export "topic"`).toBeDefined();
    expect(topic.id).toBe(id);
  });

  it('has signals and patterns, and every pattern is used', () => {
    expect(topic.signals.length).toBeGreaterThanOrEqual(3);
    for (const s of topic.signals) expect(s.see && s.think && s.why).toBeTruthy();
    const used = new Set(topic.problems.map((p) => p.pattern));
    for (const p of topic.patterns) expect(used.has(p.name), `pattern "${p.name}" has no problems`).toBe(true);
    expect(new Set(topic.patterns.map((p) => p.name)).size).toBe(topic.patterns.length);
  });

  it('lists real LeetCode problems with matching titles', () => {
    expect(topic.problems.length).toBeGreaterThanOrEqual(2);
    const wrong = topic.problems
      .map((p) => ({ p, lc: lookup(p.id) }))
      .filter(({ p, lc }) => !lc || lc.title !== p.title.trim())
      .map(({ p, lc }) => `${p.id}: wrote "${p.title}", LeetCode says "${lc?.title ?? 'no such problem'}"`);
    expect(wrong).toEqual([]);
    const ids = topic.problems.map((p) => p.id);
    expect(new Set(ids).size, 'a problem is listed twice').toBe(ids.length);
  });

  it('gives every problem a full set of help', () => {
    const names = new Set(topic.patterns.map((p) => p.name));
    for (const p of topic.problems) {
      const where = `problem ${p.id}`;
      expect(names.has(p.pattern), `${where}: unknown pattern "${p.pattern}"`).toBe(true);
      expect(p.summary.length, `${where}: summary`).toBeGreaterThan(30);
      expect(p.hints.length, `${where}: hints`).toBeGreaterThanOrEqual(2);
      expect(p.hints.length, `${where}: hints`).toBeLessThanOrEqual(4);
      expect(p.insight.length, `${where}: insight`).toBeGreaterThan(30);
      expect(p.approach.length, `${where}: approach`).toBeGreaterThanOrEqual(2);
      expect(p.ds.length, `${where}: data structures`).toBeGreaterThanOrEqual(1);
      expect(new Set(p.ds).size, `${where}: a data structure is listed twice`).toBe(p.ds.length);
      expect(p.time, `${where}: time`).toMatch(/O\(/);
      expect(p.space, `${where}: space`).toMatch(/O\(/);
      // No code: the lab teaches techniques in words.
      for (const text of [p.summary, p.insight, ...p.hints, ...p.approach, ...(p.traps ?? [])]) {
        expect(text, `${where}: looks like code`).not.toMatch(/=>|\b(const|let|var) \w+ =|\b(if|while|for) \(\s*(let |const |\w+\s*[<>!=]=?)|(?<!C)\+\+|\+=|===|&&|\|\||\w\(\)\s*\{/);
      }
    }
  });
});
