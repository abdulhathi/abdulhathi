import { createRequire } from 'node:module';
import legacy, { shout } from './legacy.cjs'; // default import = module.exports

console.log(shout('hello from commonjs'));
console.log(shout('again'));
console.log('legacy.fileName:', legacy.fileName);
console.log('legacy.calls (a copy):', legacy.calls);
console.log('legacy.getCalls() (reads the variable):', legacy.getCalls());

// createRequire gives an ES module its own require(), for the rare cases you need one.
const require = createRequire(import.meta.url);
const again = require('./legacy.cjs');
console.log('require() returns the same cached object:', again === legacy);
