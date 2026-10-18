import { describe, expect, it } from 'vitest';
import { highlight, langForFile } from '../lib/highlight';
import { splitSnippetPath } from '../lib/snippets';

describe('snippet paths', () => {
  it('splits a path into topic, stack and file', () => {
    expect(splitSnippetPath('08-jwt/node/src/server.ts')).toEqual({ topic: '08-jwt', stack: 'node', file: 'src/server.ts' });
    expect(splitSnippetPath('08-jwt/python/app.py')).toEqual({ topic: '08-jwt', stack: 'python', file: 'app.py' });
    expect(splitSnippetPath('08-jwt/dotnet/Api/Program.cs')).toEqual({ topic: '08-jwt', stack: 'dotnet', file: 'Api/Program.cs' });
    expect(splitSnippetPath('08-jwt/requests.http')).toEqual({ topic: '08-jwt', stack: null, file: 'requests.http' });
  });

  it('picks a highlighter from the file name', () => {
    expect(langForFile('src/app.ts')).toBe('typescript');
    expect(langForFile('app.py')).toBe('python');
    expect(langForFile('Api/Program.cs')).toBe('csharp');
    expect(langForFile('Api/Api.csproj')).toBe('xml');
    expect(langForFile('Directory.Packages.props')).toBe('xml');
    expect(langForFile('package.json')).toBe('json');
    expect(langForFile('requirements.txt')).toBe('plaintext');
    expect(langForFile('requests.http')).toBe('http');
  });
});

describe('highlighting', () => {
  it('registers every language langForFile can return', () => {
    for (const file of ['a.ts', 'a.js', 'a.py', 'a.cs', 'a.csproj', 'a.json', 'a.yml', 'a.md', 'a.sql', 'a.sh', 'a.http', 'a.toml', 'Dockerfile', '.env', 'requirements.txt']) {
      expect(() => highlight('x', langForFile(file))).not.toThrow();
    }
  });
});
