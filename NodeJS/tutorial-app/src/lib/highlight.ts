import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import http from 'highlight.js/lib/languages/http';
import ini from 'highlight.js/lib/languages/ini';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('http', http);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('yaml', yaml);

export type Lang =
  | 'bash' | 'dockerfile' | 'http' | 'ini' | 'javascript' | 'json'
  | 'markdown' | 'plaintext' | 'sql' | 'typescript' | 'yaml';

// Returns escaped HTML with token spans, safe to inject.
export function highlight(code: string, lang: Lang): string {
  return hljs.highlight(code, { language: lang }).value;
}

const BY_EXTENSION: [RegExp, Lang][] = [
  [/\.(ts|cts|mts)$/, 'typescript'],
  [/\.(js|cjs|mjs)$/, 'javascript'],
  [/\.json$/, 'json'],
  [/\.ya?ml$/, 'yaml'],
  [/\.md$/, 'markdown'],
  [/\.sql$/, 'sql'],
  [/\.sh$/, 'bash'],
  [/\.http$/, 'http'],
  [/(^|\/)Dockerfile$/, 'dockerfile'],
  [/(^|\/)\.?env(\.\w+)?$/, 'ini'],
];

export function langForFile(path: string): Lang {
  return BY_EXTENSION.find(([re]) => re.test(path))?.[1] ?? 'plaintext';
}
