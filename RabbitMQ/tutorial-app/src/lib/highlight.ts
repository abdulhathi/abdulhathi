import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('yaml', yaml);

export type Lang = 'bash' | 'json' | 'markdown' | 'typescript' | 'yaml';

// Returns escaped HTML with token spans, safe to inject.
export function highlight(code: string, lang: Lang): string {
  return hljs.highlight(code, { language: lang }).value;
}

export function langForFile(path: string): Lang {
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml';
  if (path.endsWith('.md')) return 'markdown';
  return 'typescript';
}
