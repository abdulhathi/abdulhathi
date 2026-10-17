import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import graphql from 'highlight.js/lib/languages/graphql';
import http from 'highlight.js/lib/languages/http';
import ini from 'highlight.js/lib/languages/ini';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import plaintext from 'highlight.js/lib/languages/plaintext';
import protobuf from 'highlight.js/lib/languages/protobuf';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGS = { bash, css, diff, dockerfile, graphql, http, ini, javascript, json, plaintext, protobuf, python, sql, typescript, xml, yaml };
for (const [name, lang] of Object.entries(LANGS)) hljs.registerLanguage(name, lang);

// Fence names used in the chapters → the highlight.js grammar and the label shown on the block.
const ALIAS: Record<string, [grammar: keyof typeof LANGS, label: string]> = {
  python: ['python', 'Python'],
  py: ['python', 'Python'],
  ts: ['typescript', 'TypeScript'],
  tsx: ['typescript', 'TSX'],
  sql: ['sql', 'SQL'],
  bash: ['bash', 'Terminal'],
  text: ['plaintext', 'Output'],
  json: ['json', 'JSON'],
  yaml: ['yaml', 'YAML'],
  dockerfile: ['dockerfile', 'Dockerfile'],
  http: ['http', 'HTTP'],
  xml: ['xml', 'XML'],
  html: ['xml', 'HTML'],
  css: ['css', 'CSS'],
  diff: ['diff', 'Diff'],
  ini: ['ini', 'INI'],
  toml: ['ini', 'TOML'],
  proto: ['protobuf', 'Protobuf'],
  hcl: ['ini', 'Terraform'],
  graphql: ['graphql', 'GraphQL'],
  js: ['javascript', 'JavaScript'],
};

export function langInfo(fence: string) {
  const [grammar, label] = ALIAS[fence.toLowerCase()] ?? ['plaintext', fence || 'Code'];
  return { grammar, label };
}

/** Escaped HTML with token spans, safe to inject. */
export function highlight(code: string, fence: string): string {
  return hljs.highlight(code, { language: langInfo(fence).grammar }).value;
}
