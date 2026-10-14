import { spawn } from 'node:child_process';
import { once } from 'node:events';

// spawn streams output as it happens: right for long-running or chatty programs.
const script = `
  let i = 0;
  const timer = setInterval(() => {
    console.log('step ' + ++i + ' of 3');
    if (i === 3) clearInterval(timer);
  }, 300);
`;
const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
console.log(`started child process ${child.pid}`);

child.stdout.setEncoding('utf8');
for await (const chunk of child.stdout) {
  process.stdout.write(`[child] ${chunk}`);
}

const [code] = await once(child, 'close');
console.log(`child exited with code ${code}`);
