import { describe, expect, it } from 'vitest';
import { listItems, parseDoc, splitTags } from '../lib/md';

const SAMPLE = `---
title: Sample
goal: A goal
minutes: 12
---

Intro text.

## Notes

Some prose.

\`\`\`python
## not a heading inside code
x = 1
\`\`\`

## Interview questions

### What is X? {core}

Answer one.

### Why Y?

Answer two.

## Coding problems

### Reverse it {easy core}

Statement.

#### Hints

1. First.
2. Second
   continues here.

#### Solution

\`\`\`python
print(1)
\`\`\`

#### Follow-ups

- More.
`;

describe('parseDoc', () => {
  const doc = parseDoc(SAMPLE);
  it('reads front matter and the intro', () => {
    expect(doc.front).toEqual({ title: 'Sample', goal: 'A goal', minutes: 12 });
    expect(doc.intro).toBe('Intro text.');
  });
  it('ignores headings inside code fences', () => {
    expect(doc.sections.map((s) => s.title)).toEqual(['Notes', 'Interview questions', 'Coding problems']);
  });
  it('splits questions and problems', () => {
    const q = doc.sections[1];
    const p = doc.sections[2];
    expect(q.kind === 'questions' && q.questions.map((x) => [x.id, x.tags])).toEqual([
      ['q-what-is-x', ['core']],
      ['q-why-y', []],
    ]);
    expect(p.kind === 'problems' && p.problems[0]).toMatchObject({
      id: 'p-reverse-it',
      level: 'easy',
      tags: ['core'],
      statement: 'Statement.',
      hints: ['First.', 'Second\ncontinues here.'],
      followUps: '- More.',
      unknown: [],
    });
  });
});

describe('helpers', () => {
  it('splits tags from a heading', () => {
    expect(splitTags('Title {medium core}')).toEqual({ title: 'Title', tags: ['medium', 'core'] });
    expect(splitTags('No tags')).toEqual({ title: 'No tags', tags: [] });
  });
  it('reads numbered and bulleted lists', () => {
    expect(listItems('1. a\n2) b\n- c')).toEqual(['a', 'b', 'c']);
  });
});

describe('front matter quoting', () => {
  it('unwraps YAML-quoted values, which writers use when a title contains a colon', () => {
    const doc = parseDoc(`---\ntitle: "SSE: streaming \\"tokens\\""\ngoal: 'It''s quoted'\nminutes: 5\n---\n\nIntro.\n`);
    expect(doc.front.title).toBe('SSE: streaming "tokens"');
    expect(doc.front.goal).toBe("It's quoted");
  });

  it('leaves unquoted values and inner quotes alone', () => {
    const doc = parseDoc(`---\ntitle: Say "hello" twice\ngoal: plain\nminutes: 1\n---\n\nIntro.\n`);
    expect(doc.front.title).toBe('Say "hello" twice');
  });
});
