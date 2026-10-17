import { useState } from 'react';
import { STACKS, type Chapter } from '../chapters';
import type { Track } from '../tracks';

/** What the drill and weak-spots pages cover: the active track, the whole library, or one stack. */
export type Scope = { id: string; label: string; includes: (c: Chapter) => boolean };

export function scopesFor(track: Track | undefined): Scope[] {
  const trackScope: Scope[] = track
    ? [
        {
          id: `track:${track.id}`,
          label: `${track.company} track`,
          includes: (c) => c.track === track.id || track.plan.some(([id]) => id === c.id),
        },
      ]
    : [];
  return [
    ...trackScope,
    { id: 'all', label: 'Whole library', includes: (c) => c.kind !== 'track' },
    ...STACKS.map((s) => ({ id: `stack:${s.id}`, label: s.title, includes: (c: Chapter) => c.stack === s.id })),
  ];
}

/** The selected scope. Starts on the active track when there is one, and falls back if the track changes. */
export function useScope(track: Track | undefined) {
  const scopes = scopesFor(track);
  const [id, setId] = useState(scopes[0].id);
  const scope = scopes.find((s) => s.id === id) ?? scopes[0];
  return { scopes, scope, setScope: setId };
}
