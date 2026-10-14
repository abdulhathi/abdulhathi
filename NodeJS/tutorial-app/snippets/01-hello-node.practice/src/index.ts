import os from 'node:os';
import { greet } from './greet.ts';

const args = process.argv.slice(2);
const shout = args.includes('--shout');
const name = args.find((arg) => !arg.startsWith('--')) ?? os.userInfo().username;

const message = greet(name);
console.log(shout ? message.toUpperCase() : message);

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
console.log(`${os.cpus().length} CPUs, ${mb(os.freemem())} MB free of ${mb(os.totalmem())} MB`);
