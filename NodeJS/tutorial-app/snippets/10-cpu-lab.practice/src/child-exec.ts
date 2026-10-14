import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// execFile runs a program directly and collects its output when it ends.
const { stdout: version } = await execFileAsync(process.execPath, ['--version']);
console.log(`child node says: ${version.trim()}`);

// Pretend this came from a user, a form field or a file name.
const userInput = 'hello; echo INJECTED: this ran as a second command';

// exec hands one string to a shell, so ; && | $( ) in the input become shell syntax.
const { stdout: viaShell } = await execAsync(`echo ${userInput}`);
console.log(`exec:     ${JSON.stringify(viaShell)}`);

// execFile passes arguments as a list, with no shell: the input stays one plain argument.
const { stdout: noShell } = await execFileAsync('echo', [userInput]);
console.log(`execFile: ${JSON.stringify(noShell)}`);

// A failing command rejects with the exit code and whatever it printed.
try {
  await execFileAsync(process.execPath, ['-e', 'console.error("boom"); process.exit(3)']);
} catch (error) {
  const { code, stderr } = error as { code: number; stderr: string };
  console.log(`failed with exit code ${code}, stderr ${JSON.stringify(stderr)}`);
}
