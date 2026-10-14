#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { parseArgs, styleText } from 'node:util';
import { addNote, findNote, NoteNotFoundError, removeNote, type Note } from './notes.ts';
import { loadNotes, notesFile, saveNotes, StoreError } from './store.ts';

const USAGE = `Usage: notes <command> [options]

Commands:
  add <text...>     Add a note
  list [--all]      Show open notes (--all includes done ones)
  edit <id> <text>  Replace a note's text
  done <id>         Mark a note as done
  remove <id>       Delete a note
  clear [--yes]     Delete every note (asks first unless --yes)
  stats             Count open and done notes

Options:
  -a, --all         With list: include done notes
  -y, --yes         With clear: do not ask for confirmation
      --json        With list: print JSON for other programs
  -h, --help        Show this help

Notes are stored in $NOTES_FILE, or ~/.notes.json if it is not set.`;

/** A mistake in how the command was typed. Exit code 2, like most Unix tools. */
class UsageError extends Error {}

async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      all: { type: 'boolean', short: 'a', default: false },
      yes: { type: 'boolean', short: 'y', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      json: { type: 'boolean', default: false },
    },
  });

  const [command, ...rest] = positionals;
  if (values.help || command === undefined || command === 'help') {
    console.log(USAGE);
    return;
  }

  const file = notesFile();
  const notes = await loadNotes(file);

  switch (command) {
    case 'add': {
      const text = rest.join(' ').trim();
      if (!text) throw new UsageError('add needs some text, e.g. notes add Buy milk');
      const note = addNote(notes, text);
      await saveNotes(file, notes);
      console.log(`${styleText('green', 'Added')} #${note.id}: ${note.text}`);
      break;
    }
    case 'list': {
      const shown = values.all ? notes : notes.filter((n) => !n.done);
      if (values.json) {
        console.log(JSON.stringify(shown, null, 2));
        break;
      }
      if (shown.length === 0) {
        console.log(notes.length ? 'Nothing left to do.' : 'No notes yet. Add one with: notes add <text>');
        break;
      }
      for (const note of shown) console.log(formatNote(note));
      break;
    }
    case 'edit': {
      const note = findNote(notes, parseId(rest[0]));
      const text = rest.slice(1).join(' ').trim();
      if (!text) throw new UsageError('edit needs the new text, e.g. notes edit 1 Buy oat milk');
      note.text = text;
      await saveNotes(file, notes);
      console.log(`${styleText('green', 'Updated')} #${note.id}: ${note.text}`);
      break;
    }
    case 'stats': {
      const open = notes.filter((n) => !n.done);
      console.log(`${notes.length} total, ${open.length} open, ${notes.length - open.length} done`);
      const oldest = open[0]; // notes are stored in the order they were added
      if (oldest) {
        const days = Math.floor((Date.now() - Date.parse(oldest.createdAt)) / 86_400_000);
        console.log(`Oldest open note: #${oldest.id}, added ${days} day(s) ago`);
      }
      break;
    }
    case 'done': {
      const note = findNote(notes, parseId(rest[0]));
      note.done = true;
      await saveNotes(file, notes);
      console.log(`${styleText('green', 'Completed')} #${note.id}: ${note.text}`);
      break;
    }
    case 'remove': {
      const id = parseId(rest[0]);
      await saveNotes(file, removeNote(notes, id));
      console.log(`${styleText('yellow', 'Removed')} #${id}`);
      break;
    }
    case 'clear': {
      if (!values.yes && !(await confirm(`Delete ${plural(notes.length, 'note')}?`))) {
        console.log('Nothing deleted.');
        break;
      }
      await saveNotes(file, []);
      console.log(`${styleText('yellow', 'Deleted')} ${plural(notes.length, 'note')}.`);
      break;
    }
    default:
      throw new UsageError(`Unknown command "${command}".`);
  }
}

function parseId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new UsageError(`Expected a note number, got "${value ?? ''}".`);
  return id;
}

function formatNote(note: Note): string {
  const box = note.done ? styleText('green', '[x]') : '[ ]';
  const text = note.done ? styleText('dim', note.text) : note.text;
  return `${box} ${styleText('bold', `#${note.id}`)} ${text}`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} (y/N) `);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

try {
  await main(process.argv.slice(2));
} catch (err) {
  process.exitCode = reportError(err);
}

/** Prints an error to stderr and returns the exit code to use. */
function reportError(err: unknown): number {
  // stderr, so `notes list > notes.txt` never hides an error inside the file.
  console.error(`${styleText('red', 'Error:')} ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof UsageError || isParseArgsError(err)) {
    console.error('Run "notes --help" for usage.');
    return 2;
  }
  // Expected failures get a one-line message; anything else is a bug, so show the stack.
  if (!(err instanceof NoteNotFoundError || err instanceof StoreError)) console.error(err);
  return 1;
}

function isParseArgsError(err: unknown): boolean {
  return err instanceof TypeError && 'code' in err && String(err.code).startsWith('ERR_PARSE_ARGS');
}
