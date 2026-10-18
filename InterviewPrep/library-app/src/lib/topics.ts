import { findChapter } from '../chapters';
import TOPICS from '../topics.json';
import { slug } from './md';

// Which section of its chapter teaches each interview question, keyed "<chapter>/<question id>" → "s-<section slug>".
// null means no one section covers it (the link then goes to the chapter). The content test keeps this file complete.
export const QUESTION_TOPICS: Readonly<Record<string, string | null>> = TOPICS;

/** The section that teaches a question: its anchor and title, or undefined when there is none. */
export function topicOf(chapterId: string, questionId: string): { anchor: string; title: string } | undefined {
  const anchor = QUESTION_TOPICS[`${chapterId}/${questionId}`];
  if (!anchor) return undefined;
  const section = findChapter(chapterId)?.doc.sections.find((s) => s.kind === 'prose' && `s-${slug(s.title)}` === anchor);
  return section ? { anchor, title: section.title } : undefined;
}
