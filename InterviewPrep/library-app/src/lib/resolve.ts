import { ALIASES, findChapter, PRACTICE_PAGES, TRACK_SLOTS, type Chapter, type PracticePage } from '../chapters';
import { findPath, type LearningPath } from '../paths';
import { findTrack, type Track } from '../tracks';

export type Resolved =
  | { kind: 'home' }
  | { kind: 'track'; track: Track }
  | { kind: 'path'; path: LearningPath }
  | { kind: 'interview'; scopeId: string }
  | { kind: 'project'; path: LearningPath }
  | { kind: 'kit' }
  | { kind: 'code'; chapterId: string; problemId: string }
  | { kind: 'page'; page: PracticePage }
  | { kind: 'chapter'; chapter: Chapter }
  | { kind: 'missing'; id: string };

/**
 * What a hash route shows. `#/` is the library home, `#/track/<id>` a track's plan, `#/mock` etc. the practice
 * pages, and `#/<id>` a chapter. Ids of merged chapters redirect, and the generic `#/welcome`, `#/coding-round` and
 * `#/stories` open the active track's own chapter.
 */
export function resolve(id: string, anchor: string, activeTrack: Track | undefined): Resolved {
  if (!id) return { kind: 'home' };
  if (id === 'track') {
    const track = findTrack(anchor);
    return track ? { kind: 'track', track } : { kind: 'home' };
  }
  if (id === 'path' || id === 'project') {
    const path = findPath(anchor);
    return path ? { kind: id, path } : { kind: 'missing', id: `${id}/${anchor}` };
  }
  if (id === 'interview' && anchor) return { kind: 'interview', scopeId: anchor };
  if (id === 'profile-kit') return { kind: 'kit' };
  if (id === 'code') {
    const [chapterId = '', problemId = ''] = anchor.split('/');
    return chapterId && problemId ? { kind: 'code', chapterId: ALIASES[chapterId] ?? chapterId, problemId } : { kind: 'missing', id: `code/${anchor}` };
  }
  const page = PRACTICE_PAGES.find((p) => p.id === id);
  if (page) return { kind: 'page', page };
  const slot = TRACK_SLOTS.indexOf(id as (typeof TRACK_SLOTS)[number]);
  if (slot >= 0) {
    const chapter = activeTrack && findChapter(activeTrack.start[slot]);
    return chapter ? { kind: 'chapter', chapter } : { kind: 'home' };
  }
  const chapter = findChapter(ALIASES[id] ?? id);
  return chapter ? { kind: 'chapter', chapter } : { kind: 'missing', id };
}
