import { describe, expect, it } from 'vitest';
import { highlight, langForFile } from '../lib/highlight';
import { splitSnippetPath } from '../lib/snippets';

describe('snippet paths', () => {
  it('splits a snapshot path into project folder and file', () => {
    expect(splitSnippetPath('03-notes-cli/src/store.ts')).toEqual({ project: '03-notes-cli', file: 'src/store.ts' });
    expect(splitSnippetPath('09-tasks-api.2-sqlite/src/db.ts')).toEqual({ project: '09-tasks-api', file: 'src/db.ts' });
  });

  it('picks a highlighter from the file name', () => {
    expect(langForFile('src/app.ts')).toBe('typescript');
    expect(langForFile('src/legacy.cts')).toBe('typescript');
    expect(langForFile('lib/old.cjs')).toBe('javascript');
    expect(langForFile('package.json')).toBe('json');
    expect(langForFile('migrations/001-init.sql')).toBe('sql');
    expect(langForFile('Dockerfile')).toBe('dockerfile');
    expect(langForFile('.env.example')).toBe('ini');
    expect(langForFile('.github/workflows/ci.yml')).toBe('yaml');
    expect(langForFile('.gitignore')).toBe('plaintext');
  });
});

describe('highlighting', () => {
  it('registers every language langForFile can return', () => {
    for (const file of ['a.ts', 'a.cjs', 'a.json', 'a.yml', 'a.md', 'a.sql', 'a.sh', 'a.http', 'Dockerfile', '.env', '.gitignore']) {
      expect(() => highlight('x', langForFile(file))).not.toThrow();
    }
  });
});
