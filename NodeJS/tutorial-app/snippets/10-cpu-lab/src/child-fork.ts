import { fork } from 'node:child_process';
import { once } from 'node:events';

// fork starts another Node process running a module, with a message channel between the two.
const child = fork(new URL('./ipc-child.ts', import.meta.url));

child.send({ n: 35 });
const [reply] = await once(child, 'message');
console.log(`parent ${process.pid} got`, reply);

child.disconnect(); // close the channel; the child has nothing left to do, so it exits
const [code] = await once(child, 'exit');
console.log(`child exited with code ${code}`);
