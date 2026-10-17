// @vitest-environment node
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPS, findApp } from '../src/apps';
import { allPages, contentIds, objectPages, pagesFor } from './pages';

const portfolio = join(import.meta.dirname, '..', '..');
const pages = allPages(APPS, portfolio);

describe('page lists read from the real apps', () => {
  it('finds pages for every app', () => {
    for (const app of APPS) expect(pages[app.id].length, app.id).toBeGreaterThan(0);
  });

  it('gives every page a unique id and a path on the app', () => {
    for (const app of APPS) {
      const ids = pages[app.id].map((p) => p.id);
      expect(new Set(ids).size, app.id).toBe(ids.length);
      for (const p of pages[app.id]) expect(p.path.startsWith('/'), `${app.id}/${p.id}`).toBe(true);
    }
  });

  it.each(['capgemini', 'citiustech'])('%s: every chapter file is listed with its front-matter title, after the practice pages', (id) => {
    const app = findApp(id)!;
    const list = pages[id];
    expect(list.slice(0, 3).map((p) => p.id)).toEqual(['mock', 'drill', 'progress']);
    const onDisk = contentIds(join(portfolio, app.dir));
    expect(list.filter((p) => p.group !== 'Practice').map((p) => p.id).sort()).toEqual(onDisk.sort());
    expect(list.every((p) => p.title !== p.id)).toBe(true); // every title came from a front matter line
  });

  it('reads the Capgemini streaming chapters with their groups', () => {
    const sse = pages.capgemini.find((p) => p.id === 'sse')!;
    expect(sse.title).toBe('Server-Sent Events: streaming tokens to the browser'); // YAML quotes removed
    expect(pages.capgemini.filter((p) => /^["']/.test(p.title))).toEqual([]);
    expect(sse.group).toBe('Real-time streaming');
    expect(sse.path).toBe('/#/sse');
  });

  it('reads the Interview Library: practice pages, tracks with their own chapters, then every stack', () => {
    const list = pages.library;
    expect(list.slice(0, 3).map((p) => p.id)).toEqual(['mock', 'drill', 'progress']);
    expect(list.find((p) => p.id === 'track-capgemini')).toMatchObject({ title: 'Capgemini track', group: 'Tracks', path: '/#/track/capgemini' });
    expect(list.find((p) => p.id === 'capgemini-stories')?.group).toBe('Tracks');
    expect(list.find((p) => p.id === 'sse')).toMatchObject({ group: 'Real-time streaming', path: '/#/sse' });
    expect(list.find((p) => p.id === 'code-python')?.group).toBe('Live coding · Python');
    expect(list.find((p) => p.id === 'path-kafka')).toMatchObject({ title: 'Apache Kafka learning path', group: 'Learning paths', path: '/#/path/kafka' });
    expect(list.filter((p) => p.group === 'Learning paths')).toHaveLength(19); // 18 paths and the profile kit
    expect(list.filter((p) => !['Practice', 'Tracks', 'Learning paths'].includes(p.group ?? ''))).toHaveLength(78);
  });

  it('reads the DSA lab: practice pages, guides, 84 chapters and references', () => {
    const list = pages.dsa;
    expect(list.slice(0, 3).map((p) => p.id)).toEqual(['tracker', 'drill', 'review']);
    expect(list.filter((p) => p.group !== 'Practice')).toHaveLength(84);
    expect(list.find((p) => p.id === 'welcome')).toMatchObject({ title: 'How this lab works', group: 'Start here' });
    expect(list.find((p) => p.id === 'string-matching')?.group).toBe('Phase 7 · Advanced structures');
  });

  it('reads the Node.js and RabbitMQ chapter objects in order', () => {
    expect(pages.nodejs[0]).toMatchObject({ id: 'welcome', title: 'How this course works', group: 'Start here', path: '/#/welcome' });
    expect(pages.rabbitmq[0]).toMatchObject({ id: 'build', group: 'Foundations' });
    expect(pages.rabbitmq.at(-1)).toMatchObject({ id: 'cheat-sheet', group: 'Reference' });
  });

  it('uses #<id> links for the AKS app, which routes without a slash', () => {
    expect(pages.aks[0]).toMatchObject({ id: 'getting-started', path: '/#getting-started' });
  });
});

describe('objectPages', () => {
  it('reads both quote styles and escapes, and skips type declarations', () => {
    const source = `
      type Chapter = { id: string; title: string };
      export const LIST = [
        { id: 'a', group: 'One', title: 'It\\'s first' },
        { id: "b", title: "Manacher's \\"algorithm\\"" },
        { id: 'no-title', goal: 'skipped' },
      ];`;
    expect(objectPages(source, '#/')).toEqual([
      { id: 'a', title: "It's first", group: 'One', path: '/#/a' },
      { id: 'b', title: 'Manacher\'s "algorithm"', group: undefined, path: '/#/b' },
    ]);
  });

  it('returns an empty list for an app whose files are missing', () => {
    const ghost = { ...APPS[0], dir: 'does/not/exist' };
    expect(pagesFor(ghost, portfolio)).toEqual([]);
  });
});
