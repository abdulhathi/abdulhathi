// Pure functions: no files, no console, no process. Easy to test and reuse.

export type Note = {
  id: number;
  text: string;
  done: boolean;
  createdAt: string; // ISO 8601, because JSON has no Date type
};

export class NoteNotFoundError extends Error {
  constructor(id: number) {
    super(`There is no note #${id}.`);
    this.name = 'NoteNotFoundError';
  }
}

export function addNote(notes: Note[], text: string, now = new Date()): Note {
  const id = Math.max(0, ...notes.map((n) => n.id)) + 1;
  const note: Note = { id, text, done: false, createdAt: now.toISOString() };
  notes.push(note);
  return note;
}

export function findNote(notes: Note[], id: number): Note {
  const note = notes.find((n) => n.id === id);
  if (!note) throw new NoteNotFoundError(id);
  return note;
}

export function removeNote(notes: Note[], id: number): Note[] {
  findNote(notes, id); // throws if missing
  return notes.filter((n) => n.id !== id);
}
