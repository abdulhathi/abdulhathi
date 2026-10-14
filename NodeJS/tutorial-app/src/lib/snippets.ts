// The tutorial shows the exact files that were run on Node 24 LTS before they
// went into a chapter. They live in /snippets (outside src, so this app does
// not type-check them) and are bundled as plain strings.
//
// Layout: snippets/<snapshot>/<path inside the project>. A snapshot is one
// runnable state of a practice project: "03-notes-cli", or, for the project
// that grows over several chapters, "09-tasks-api.2-sqlite".
const files = import.meta.glob(
  [
    '../../snippets/**/*.{ts,cts,mts,js,cjs,mjs,json,yml,yaml,sql,md,txt,http,sh}',
    '../../snippets/**/{Dockerfile,.dockerignore,.gitignore,.node-version}',
    // ** does not descend into dot-folders, so CI workflows need their own pattern.
    '../../snippets/**/.github/workflows/*.{yml,yaml}',
    // Vite refuses to serve .env* files, so chapters show .env.example inline with <Code>.
    '!../../snippets/**/.env*',
    '!../../snippets/**/node_modules/**',
    '!../../snippets/**/package-lock.json',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const PREFIX = '../../snippets/';

export function snippet(path: string): string {
  const source = files[PREFIX + path];
  if (source === undefined) throw new Error(`Snippet not found: snippets/${path}`);
  return source.replace(/\n+$/, '');
}

export const snippetPaths = Object.keys(files).map((key) => key.slice(PREFIX.length));

/** "09-tasks-api.2-sqlite/src/app.ts" → { project: "09-tasks-api", file: "src/app.ts" } */
export function splitSnippetPath(path: string): { project: string; file: string } {
  const slash = path.indexOf('/');
  if (slash < 0) throw new Error(`Snippet path needs a project folder: ${path}`);
  return { project: path.slice(0, slash).split('.')[0], file: path.slice(slash + 1) };
}
