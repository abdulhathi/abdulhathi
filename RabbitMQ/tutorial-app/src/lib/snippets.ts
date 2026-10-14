// The tutorial shows the exact files that were run against a real broker.
// They live in /snippets (outside src, so this app does not type-check them)
// and are bundled as plain strings.
const files = import.meta.glob('../../snippets/**/*.{ts,json,yml}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const PREFIX = '../../snippets/';

export function snippet(path: string): string {
  const source = files[PREFIX + path];
  if (source === undefined) throw new Error(`Snippet not found: snippets/${path}`);
  return source.replace(/\n+$/, '');
}

export const snippetPaths = Object.keys(files).map((key) => key.slice(PREFIX.length));
