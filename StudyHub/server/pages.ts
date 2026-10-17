// Builds each app's page list from the app's own source, so new chapters appear in the hub without editing it.
// Each lab registers its pages differently, so there is one small reader per registry style.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HubApp, StaticPage } from '../src/apps';

export type Page = StaticPage;

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

// A JS string literal in single or double quotes, with escapes.
const STR = String.raw`(['"])((?:\\.|(?!\1).)*)\1`;
const unescape = (s: string) => s.replace(/\\(.)/g, '$1');

/** `{ id: '…', …, title: '…', group: '…' }` objects, in file order. Only quoted ids count, so type declarations are skipped. */
export function objectPages(source: string, hash: '#/' | '#'): Page[] {
  const idRe = new RegExp(String.raw`\bid:\s*` + STR, 'g');
  const starts = [...source.matchAll(idRe)];
  return starts.flatMap((m, i) => {
    const segment = source.slice(m.index, starts[i + 1]?.index ?? m.index + 2000);
    const title = segment.match(new RegExp(String.raw`\btitle:\s*` + STR));
    if (!title) return [];
    const group = segment.match(new RegExp(String.raw`\bgroup:\s*` + STR));
    const id = unescape(m[2]);
    return [{ id, title: unescape(title[2]), group: group ? unescape(group[2]) : undefined, path: `/${hash}${id}` }];
  });
}

/** Front-matter values may be YAML-quoted when they contain a colon: "A: b" → A: b. */
export function unquoteYaml(value: string): string {
  const dq = value.match(/^"(.*)"$/);
  if (dq) return dq[1].replace(/\\(["\\])/g, '$1');
  const sq = value.match(/^'(.*)'$/);
  return sq ? sq[1].replace(/''/g, "'") : value;
}

/** The interview labs: GROUPS rows of ids in src/chapters.ts, titles from content/<id>.md, plus the practice pages. */
export function interviewLabPages(dir: string): Page[] {
  const registry = read(join(dir, 'src', 'chapters.ts'));
  const practiceStart = registry.indexOf('PRACTICE_PAGES');
  const practice = practiceStart < 0 ? [] : objectPages(registry.slice(practiceStart), '#/').map((p) => ({ ...p, group: 'Practice' }));
  const chapters = [...registry.matchAll(/\[\s*'([^']+)',\s*\d+,\s*\[([^\]]*)\]\s*\]/g)].flatMap(([, group, list]) =>
    [...list.matchAll(/'([a-z0-9-]+)'/g)].map(([, id]) => {
      const front = read(join(dir, 'content', `${id}.md`)).match(/^title:\s*(.+)$/m);
      return { id, title: front ? unquoteYaml(front[1].trim()) : id, group, path: `/#/${id}` };
    }),
  );
  return [...practice, ...chapters];
}

/** The Interview Library: practice pages, each track (its page and own chapters), then every stack's chapters. */
export function libraryPages(dir: string): Page[] {
  const registry = read(join(dir, 'src', 'chapters.ts'));
  const tracks = read(join(dir, 'src', 'tracks.ts'));
  const titleOf = (id: string) => {
    const front = read(join(dir, 'content', `${id}.md`)).match(/^title:\s*(.+)$/m);
    return front ? unquoteYaml(front[1].trim()) : id;
  };
  const practiceStart = registry.indexOf('PRACTICE_PAGES');
  const practice = practiceStart < 0 ? [] : objectPages(registry.slice(practiceStart), '#/').map((p) => ({ ...p, group: 'Practice' }));
  const trackPages = [...tracks.matchAll(/id:\s*'([a-z0-9-]+)',\s*company:\s*'([^']+)'[\s\S]*?start:\s*\[([^\]]*)\]/g)].flatMap(([, id, company, start]) => [
    { id: `track-${id}`, title: `${company} track`, group: 'Tracks', path: `/#/track/${id}` },
    ...[...start.matchAll(/'([a-z0-9-]+)'/g)].map(([, cid]) => ({ id: cid, title: titleOf(cid), group: 'Tracks', path: `/#/${cid}` })),
  ]);
  const stacks = [...registry.matchAll(/\{\s*id:\s*'[a-z0-9-]+',\s*title:\s*'([^']+)'[\s\S]*?chapters:\s*\[([^\]]*)\]/g)].flatMap(([, group, list]) =>
    [...list.matchAll(/'([a-z0-9-]+)'/g)].map(([, id]) => ({ id, title: titleOf(id), group, path: `/#/${id}` })),
  );
  const pathsSource = read(join(dir, 'src', 'paths.ts'));
  const pathsStart = pathsSource.indexOf('export const PATHS');
  const learningPaths = pathsStart < 0 ? [] : [
    ...objectPages(pathsSource.slice(pathsStart), '#/').map((p) => ({ ...p, id: `path-${p.id}`, title: `${p.title} learning path`, group: 'Learning paths', path: `/#/path/${p.id}` })),
    { id: 'profile-kit', title: 'Profile kit', group: 'Learning paths', path: '/#/profile-kit' },
  ];
  return [...practice, ...learningPaths, ...trackPages, ...stacks];
}

/** The DSA lab: `['Group', 'kind', [ ['id', 'title', …], … ]]` tuples, plus its practice pages. */
export function dsaLabPages(dir: string): Page[] {
  const registry = read(join(dir, 'src', 'chapters', 'index.ts'));
  const pages: Page[] = [];
  let group = '';
  const header = /^\s*\['([^']+)',\s*'(?:guide|topic|reference)',\s*\[/;
  // The id is group 1, so the title's quote is group 2 (STR's \1 would point at the id here).
  const entry = /^\s*\['([a-z0-9-]+)',\s*(['"])((?:\\.|(?!\2).)*)\2/;
  for (const line of registry.split('\n')) {
    const h = line.match(header);
    if (h) group = h[1];
    else if (group) {
      const e = line.match(entry);
      if (e) pages.push({ id: e[1], title: unescape(e[3]), group, path: `/#/${e[1]}` });
    }
  }
  const practiceStart = registry.indexOf('PRACTICE_PAGES');
  const practice = practiceStart < 0 ? [] : objectPages(registry.slice(practiceStart), '#/').map((p) => ({ ...p, group: 'Practice' }));
  return [...practice, ...pages];
}

export function pagesFor(app: HubApp, portfolio: string): Page[] {
  const dir = join(portfolio, app.dir);
  const source = app.pages;
  switch (source.type) {
    case 'interview-lab':
      return interviewLabPages(dir);
    case 'library':
      return libraryPages(dir);
    case 'dsa-lab':
      return dsaLabPages(dir);
    case 'object-list':
      return objectPages(read(join(dir, source.file)), source.hash);
    case 'static':
      return source.pages;
  }
}

/** Every app's pages, keyed by app id. An app whose source cannot be read gets an empty list, never an error. */
export function allPages(apps: HubApp[], portfolio: string): Record<string, Page[]> {
  return Object.fromEntries(
    apps.map((app) => {
      try {
        return [app.id, pagesFor(app, portfolio)];
      } catch {
        return [app.id, []];
      }
    }),
  );
}

/** For tests: the chapter files an interview lab has on disk. */
export const contentIds = (dir: string) =>
  existsSync(join(dir, 'content')) ? readdirSync(join(dir, 'content')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)) : [];
