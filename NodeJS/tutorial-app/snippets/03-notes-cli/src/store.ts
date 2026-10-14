import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Note } from './notes.ts';

/** The notes file exists but cannot be used. */
export class StoreError extends Error {}

/** Where notes live: $NOTES_FILE if set, otherwise ~/.notes.json */
export function notesFile(): string {
  return process.env.NOTES_FILE ?? path.join(os.homedir(), '.notes.json');
}

export async function loadNotes(file: string): Promise<Note[]> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    // No file yet is normal on first run. Anything else is a real problem.
    if (isErrnoException(err) && err.code === 'ENOENT') return [];
    throw err;
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new StoreError(`${file} is not valid JSON. Fix it or delete it.`);
  }
  if (!Array.isArray(data)) throw new StoreError(`${file} does not contain a list of notes.`);
  return data as Note[];
}

export async function saveNotes(file: string, notes: Note[]): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  // Write a temporary file, then rename it over the real one. A rename is atomic,
  // so a crash mid-write can never leave a half-written notes file behind.
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(notes, null, 2) + '\n', 'utf8');
  await rename(temp, file);
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
