import os from 'node:os';
import { greet } from './greet.ts';

// process.argv is [path to node, path to this file, ...your arguments]
const name = process.argv[2] ?? os.userInfo().username;

console.log(greet(name));
console.log(`Node ${process.version} on ${process.platform} (${process.arch})`);
console.log(`This file: ${import.meta.filename}`);
console.log(`Process ${process.pid} has been running for ${process.uptime().toFixed(2)}s`);
